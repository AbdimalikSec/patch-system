import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function priorityRank(p) {
  const map = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  return map[p] || 0;
}

function badgeClass(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "critical") return "badge critical";
  if (p === "high")     return "badge high";
  if (p === "medium")   return "badge medium";
  return "badge low";
}

function exportCSV(rows) {
  const header = ["hostname", "os", "ip", "missingCount", "failedCount", "riskScore", "priority", "lastSeen"];
  const lines  = [header.join(",")];
  for (const r of rows) {
    const line = [
      r.hostname,
      r.os,
      r.ip || "",
      r.patch?.missingCount ?? "",
      r.compliance?.failedCount ?? "",
      r.risk?.score ?? "",
      r.risk?.priority ?? "",
      r.lastSeen || "",
    ].map(v => `"${String(v).replaceAll('"', '""')}"`).join(",");
    lines.push(line);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "riskpatch_overview.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function FleetHealth({ rows }) {
  const healthyCount = useMemo(() =>
    rows.filter(r => (r?.risk?.score || 0) < 20 && (r?.compliance?.failedCount || 0) === 0).length,
  [rows]);
  const pct = rows.length ? Math.round((healthyCount / rows.length) * 100) : 0;

  return (
    <div className="card" style={{ flex: 1.5, display: "flex", flexDirection: "column", padding: "20px" }}>
      <div className="cardLabel" style={{ marginBottom: 16 }}>Overall Fleet Health</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ position: "relative", width: 100, height: 100 }}>
          <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
            <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="var(--line)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="var(--accent)" strokeWidth="3"
              strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 1s ease" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 900 }}>
            {pct}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{healthyCount} of {rows.length} assets</div>
          <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: 4 }}>Healthy & Compliant</div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <div className={`badge ${pct > 80 ? "low" : pct > 50 ? "medium" : "critical"}`} style={{ fontSize: "10px" }}>
              {pct > 80 ? "Optimal" : pct > 50 ? "Warning" : "Critical"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityFeed({ rows }) {
  const recentAssets = useMemo(() =>
    [...rows].filter(r => r.lastSeen).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)).slice(0, 5),
  [rows]);

  return (
    <div className="card" style={{ flex: 1, padding: "20px" }}>
      <div className="cardLabel" style={{ marginBottom: 16 }}>Recent Activity</div>
      <div style={{ display: "grid", gap: 14 }}>
        {recentAssets.map((r, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, alignItems: "center", paddingBottom: 10,
            borderBottom: i === recentAssets.length - 1 ? "none" : "1px solid var(--line)"
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>{r.hostname} checked in</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: 2 }}>
                {new Date(r.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <Link to={`/asset/${encodeURIComponent(r.hostname)}`} className="btn" style={{ padding: "4px 8px", fontSize: "10px" }}>View</Link>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Trend Chart Component ─────────────────────────────────────────────────────
const ASSET_COLORS = {
  "DC1":         "hsl(350,100%,65%)",
  "HQ-staff-01": "hsl(45,100%,55%)",
  "kali":        "hsl(180,80%,50%)",
};

function TrendChart() {
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [days, setDays]       = useState(30);
  const [metric, setMetric]   = useState("score");

  function loadHistory(d) {
    setLoading(true);
    axios.get(`${API}/api/snapshots/history?days=${d}`)
      .then(res => setHistory(res.data?.data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadHistory(days); }, [days]);

  const allDates = (() => {
    const s = new Set();
    Object.values(history).forEach(pts => pts.forEach(p => s.add(p.date)));
    return Array.from(s).sort();
  })();

  const assets  = Object.keys(history);
  const hasData = allDates.length > 0;
  const W = 800, H = 200;
  const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const mMax = metric === "score" ? 100 : metric === "failedCount" ? 300 : 50;

  const getY = v => PAD.top + cH - (v / mMax) * cH;
  const getX = d => {
    const i = allDates.indexOf(d);
    return allDates.length <= 1 ? PAD.left + cW / 2 : PAD.left + (i / (allDates.length - 1)) * cW;
  };
  const buildPath = name => (history[name] || [])
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(p.date)} ${getY(p[metric] || 0)}`)
    .join(" ");

  function takeSnapshot() {
    axios.post(`${API}/api/snapshots/record`)
      .then(() => loadHistory(days))
      .catch(() => {});
  }

  return (
    <div className="card" style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Risk Trend History</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Track how each asset risk profile changes over time</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="input" style={{ fontSize: 12, padding: "6px 10px" }} value={metric} onChange={e => setMetric(e.target.value)}>
            <option value="score">Risk Score</option>
            <option value="failedCount">CIS Failures</option>
            <option value="missingCount">Missing Patches</option>
          </select>
          <select className="input" style={{ fontSize: 12, padding: "6px 10px" }} value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
          </select>
        </div>
      </div>

      {loading && <div className="muted" style={{ padding: 20 }}>Loading trend data...</div>}

      {!loading && !hasData && (
        <div style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>No trend data yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>Take a snapshot to start tracking risk trends over time.</div>
          <button className="btn" style={{ fontSize: 12 }} onClick={takeSnapshot}>📸 Take First Snapshot</button>
        </div>
      )}

      {!loading && hasData && (
        <>
          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            {assets.map(name => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 16, height: 3, borderRadius: 2, background: ASSET_COLORS[name] || "var(--accent)" }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{name}</span>
              </div>
            ))}
            <button className="btn" style={{ fontSize: 11, padding: "4px 10px", marginLeft: "auto" }} onClick={takeSnapshot}>📸 Update Snapshot</button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 400, height: "auto" }}>
              {[0, 0.25, 0.5, 0.75, 1].map(f => {
                const val = Math.round(f * mMax);
                const y   = getY(val);
                return (
                  <g key={f}>
                    <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="4,4" />
                    <text x={PAD.left - 6} y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: "var(--muted)" }}>{val}</text>
                  </g>
                );
              })}
              {allDates.filter((_, i) => i % Math.max(1, Math.ceil(allDates.length / 7)) === 0).map(d => (
                <text key={d} x={getX(d)} y={H - 6} textAnchor="middle" style={{ fontSize: 9, fill: "var(--muted)" }}>{d.slice(5)}</text>
              ))}
              {assets.map(name => {
                const color  = ASSET_COLORS[name] || "var(--accent)";
                const points = history[name] || [];
                return (
                  <g key={name}>
                    <path d={buildPath(name)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {points.map((p, i) => (
                      <circle key={i} cx={getX(p.date)} cy={getY(p[metric] || 0)} r="3" fill={color} stroke="var(--bg)" strokeWidth="1.5">
                        <title>{name} — {p.date}: {p[metric] || 0}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}

export default function Overview() {
  const [rows, setRows]       = useState([]);
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [q, setQ]             = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/assets/overview`);
      setRows(res.data?.data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const qq   = q.trim().toLowerCase();
    const base = rows.filter(r => {
      const matchesPriority = priorityFilter === "All" ? true : r?.risk?.priority === priorityFilter;
      const matchesSearch   = !qq ? true : (
        (r.hostname || "").toLowerCase().includes(qq) ||
        (r.os || "").toLowerCase().includes(qq) ||
        (r.ip || "").toLowerCase().includes(qq)
      );
      return matchesPriority && matchesSearch;
    });
    return [...base].sort((a, b) => {
      const pr = priorityRank(b?.risk?.priority) - priorityRank(a?.risk?.priority);
      if (pr !== 0) return pr;
      return (b?.risk?.score || 0) - (a?.risk?.score || 0);
    });
  }, [rows, priorityFilter, q]);

  const kpis = useMemo(() => {
    const total        = rows.length;
    const high         = rows.filter(r => ["High", "Critical"].includes(r?.risk?.priority)).length;
    // failedCount in compliance now comes from live compliancechecks via assets.js
    const nonCompliant = rows.filter(r => (r?.compliance?.failedCount || 0) > 0).length;
    const overdue      = rows.filter(r => {
      const t = r?.patch?.collectedAt;
      if (!t) return true;
      return Date.now() - new Date(t).getTime() > 7 * 24 * 60 * 60 * 1000;
    }).length;
    return { total, high, nonCompliant, overdue };
  }, [rows]);

  return (
    <Layout
      title="Security Dashboard"
      rightControls={
        <>
          <input className="input" placeholder="Search fleet..." value={q} onChange={e => setQ(e.target.value)} />
          <select className="input" style={{ minWidth: 140 }} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            <option value="All">All Priorities</option>
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <button className="btn" onClick={load}>Refresh</button>
          <button className="btn" onClick={() => exportCSV(filtered)}>Export CSV</button>
        </>
      }
    >
      <div className="kpis">
        <div className="card">
          <div className="cardLabel">Protected Assets</div>
          <div className="cardValue">{kpis.total}</div>
        </div>
        <div className="card">
          <div className="cardLabel">High/Critical Risk</div>
          <div className="cardValue" style={{ color: kpis.high > 0 ? "hsl(350, 100%, 65%)" : "inherit" }}>{kpis.high}</div>
        </div>
        <div className="card">
          <div className="cardLabel">Non-Compliant</div>
          <div className="cardValue" style={{ color: kpis.nonCompliant > 0 ? "hsl(25, 100%, 60%)" : "inherit" }}>{kpis.nonCompliant}</div>
        </div>
        <div className="card">
          <div className="cardLabel">Patch Overdue</div>
          <div className="cardValue" style={{ color: kpis.overdue > 0 ? "hsl(45, 100%, 50%)" : "inherit" }}>{kpis.overdue}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
        <FleetHealth rows={rows} />
        <ActivityFeed rows={rows} />
      </div>

      <TrendChart />
      {loading && <div className="muted">Loading analytics...</div>}
      {err    && <div style={{ color: "crimson" }}>{err}</div>}

      {!loading && !err && (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Operating System</th>
                <th>Patch Risk</th>
                <th>SCA Failed</th>
                <th>Security Score</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.hostname}>
                  <td>
                    <Link to={`/asset/${encodeURIComponent(r.hostname)}`} style={{ fontWeight: 600 }}>{r.hostname}</Link>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: 2 }}>{r.ip || "No IP"}</div>
                  </td>
                  <td style={{ fontSize: "13px" }}>{r.os}</td>
                  <td>{r.patch?.missingCount ?? "0"} updates</td>
                  <td style={{ fontWeight: 700, color: (r.compliance?.failedCount > 0 ? "hsl(350, 100%, 65%)" : "inherit") }}>
                    {r.compliance?.failedCount ?? "0"}
                  </td>
                  <td>
                    <span className={badgeClass(r?.risk?.priority)}>
                      {r?.risk?.priority ?? "-"} ({r?.risk?.score ?? "0"})
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: "12px" }}>
                    {r.lastSeen ? new Date(r.lastSeen).toLocaleTimeString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}