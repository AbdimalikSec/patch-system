import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function priorityRank(p) {
  const map = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  return map[p] || 0;
}

function badgeClass(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "critical") return "badge critical";
  if (p === "high") return "badge high";
  if (p === "medium") return "badge medium";
  return "badge low";
}

function exportCSV(rows) {
  const header = ["hostname", "os", "ip", "missingCount", "failedCount", "riskScore", "priority", "lastSeen"];
  const lines = [header.join(",")];
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
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
    lines.push(line);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "triarch_overview.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const cardLabelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function KpiCard({ label, value, color }) {
  return (
    <div className="card">
      <div className="cardLabel">{label}</div>
      <div className="cardValue" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function FleetHealth({ rows }) {
  const healthyCount = useMemo(
    () =>
      rows.filter(
        (r) => (r?.risk?.score || 0) < 20 && (r?.compliance?.failedCount || 0) === 0,
      ).length,
    [rows],
  );
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
  const recentAssets = useMemo(
    () => [...rows].filter((r) => r.lastSeen).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)).slice(0, 5),
    [rows],
  );

  return (
    <div className="card" style={{ flex: 1, padding: "20px" }}>
      <div className="cardLabel" style={{ marginBottom: 16 }}>Recent Activity</div>
      <div style={{ display: "grid", gap: 14 }}>
        {recentAssets.map((r, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, alignItems: "center", paddingBottom: 10,
            borderBottom: i === recentAssets.length - 1 ? "none" : "1px solid var(--line)",
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
  "DC1": "hsl(350,100%,65%)",
  "HQ-staff-01": "hsl(45,100%,55%)",
  "kali": "hsl(180,80%,50%)",
};

function TrendChart({ canSnapshot = true }) {
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState("score");

  function loadHistory(d) {
    setLoading(true);
    axios.get(`${API}/api/snapshots/history?days=${d}`)
      .then((res) => setHistory(res.data?.data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadHistory(days); }, [days]);

  const allDates = (() => {
    const s = new Set();
    Object.values(history).forEach((pts) => pts.forEach((p) => s.add(p.date)));
    return Array.from(s).sort();
  })();

  const assets = Object.keys(history);
  const hasData = allDates.length > 0;
  const W = 800, H = 200;
  const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const mMax = metric === "score" ? 100 : metric === "failedCount" ? 300 : 50;

  const getY = (v) => PAD.top + cH - (v / mMax) * cH;
  const getX = (d) => {
    const i = allDates.indexOf(d);
    return allDates.length <= 1 ? PAD.left + cW / 2 : PAD.left + (i / (allDates.length - 1)) * cW;
  };
  const buildPath = (name) => (history[name] || [])
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
          <select className="input" style={{ fontSize: 12, padding: "6px 10px" }} value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="score">Risk Score</option>
            <option value="failedCount">CIS Failures</option>
            <option value="missingCount">Missing Patches</option>
          </select>
          <select className="input" style={{ fontSize: 12, padding: "6px 10px" }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
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
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            {canSnapshot
              ? "Take a snapshot to start tracking risk trends over time."
              : "No trend data has been recorded yet."}
          </div>
          {canSnapshot && (
            <button className="btn" style={{ fontSize: 12 }} onClick={takeSnapshot}>📸 Take First Snapshot</button>
          )}
        </div>
      )}

      {!loading && hasData && (
        <>
          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            {assets.map((name) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 16, height: 3, borderRadius: 2, background: ASSET_COLORS[name] || "var(--accent)" }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{name}</span>
              </div>
            ))}
            {canSnapshot && (
              <button className="btn" style={{ fontSize: 11, padding: "4px 10px", marginLeft: "auto" }} onClick={takeSnapshot}>📸 Update Snapshot</button>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 400, height: "auto" }}>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                const val = Math.round(f * mMax);
                const y = getY(val);
                return (
                  <g key={f}>
                    <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="4,4" />
                    <text x={PAD.left - 6} y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: "var(--muted)" }}>{val}</text>
                  </g>
                );
              })}
              {allDates.filter((_, i) => i % Math.max(1, Math.ceil(allDates.length / 7)) === 0).map((d) => (
                <text key={d} x={getX(d)} y={H - 6} textAnchor="middle" style={{ fontSize: 9, fill: "var(--muted)" }}>{d.slice(5)}</text>
              ))}
              {assets.map((name) => {
                const color = ASSET_COLORS[name] || "var(--accent)";
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

// ── Section header used across all role dashboards ─────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — full fleet overview (original dashboard, unchanged)
// ══════════════════════════════════════════════════════════════════════════════
function AdminOverview({ rows, loading, err, load }) {
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const base = rows.filter((r) => {
      const matchesPriority = priorityFilter === "All" ? true : r?.risk?.priority === priorityFilter;
      const matchesSearch = !qq
        ? true
        : (r.hostname || "").toLowerCase().includes(qq) ||
          (r.os || "").toLowerCase().includes(qq) ||
          (r.ip || "").toLowerCase().includes(qq);
      return matchesPriority && matchesSearch;
    });
    return [...base].sort((a, b) => {
      const pr = priorityRank(b?.risk?.priority) - priorityRank(a?.risk?.priority);
      if (pr !== 0) return pr;
      return (b?.risk?.score || 0) - (a?.risk?.score || 0);
    });
  }, [rows, priorityFilter, q]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const high = rows.filter((r) => ["High", "Critical"].includes(r?.risk?.priority)).length;
    const nonCompliant = rows.filter((r) => (r?.compliance?.failedCount || 0) > 0).length;
    const overdue = rows.filter((r) => {
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
          <input className="input" placeholder="Search fleet..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ minWidth: 140 }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
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
        <KpiCard label="Protected Assets" value={kpis.total} />
        <KpiCard label="High/Critical Risk" value={kpis.high} color={kpis.high > 0 ? "hsl(350,100%,65%)" : undefined} />
        <KpiCard label="Non-Compliant" value={kpis.nonCompliant} color={kpis.nonCompliant > 0 ? "hsl(25,100%,60%)" : undefined} />
        <KpiCard label="Patch Overdue" value={kpis.overdue} color={kpis.overdue > 0 ? "hsl(45,100%,50%)" : undefined} />
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
        <FleetHealth rows={rows} />
        <ActivityFeed rows={rows} />
      </div>

      <TrendChart canSnapshot />

      {loading && <div className="muted">Loading analytics...</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}

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
                  <td style={{ fontWeight: 700, color: r.compliance?.failedCount > 0 ? "hsl(350,100%,65%)" : "inherit" }}>
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

// ══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE OFFICER — compliance-focused summary
// ══════════════════════════════════════════════════════════════════════════════
function ComplianceOfficerOverview({ rows, loading, err, load }) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/tickets`)
      .then((res) => setTickets(res.data?.data || []))
      .catch(() => setTickets([]))
      .finally(() => setTicketsLoading(false));
  }, []);

  function ageInDays(createdAt) {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  const kpis = useMemo(() => {
    const nonCompliant = rows.filter((r) => (r?.compliance?.failedCount || 0) > 0).length;
    const totalFailed = rows.reduce((sum, r) => sum + (r?.compliance?.failedCount || 0), 0);
    const openTickets = tickets.filter((t) => t.status === "open").length;
    const unassigned = tickets.filter((t) => !t.assignedTo).length;
    return { nonCompliant, totalFailed, openTickets, unassigned };
  }, [rows, tickets]);

  const myTickets = useMemo(() => {
    return tickets
      .filter((t) => t.assignedTo === user?.username && t.status !== "resolved")
      .map((t) => ({ ...t, ageDays: ageInDays(t.createdAt) }))
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [tickets, user]);

  const agingBreakdown = useMemo(() => {
    const openNonResolved = tickets.filter((t) => t.status !== "resolved");
    const fresh = openNonResolved.filter((t) => ageInDays(t.createdAt) < 7).length;
    const aging = openNonResolved.filter((t) => {
      const d = ageInDays(t.createdAt);
      return d >= 7 && d < 14;
    }).length;
    const stale = openNonResolved.filter((t) => {
      const d = ageInDays(t.createdAt);
      return d >= 14 && d < 30;
    }).length;
    const critical = openNonResolved.filter((t) => ageInDays(t.createdAt) >= 30).length;
    return { fresh, aging, stale, critical };
  }, [tickets]);

  const worstAssets = useMemo(
    () =>
      [...rows]
        .filter((r) => (r?.compliance?.failedCount || 0) > 0)
        .sort((a, b) => (b?.compliance?.failedCount || 0) - (a?.compliance?.failedCount || 0))
        .slice(0, 8),
    [rows],
  );

  return (
    <Layout
      title="Compliance Overview"
      rightControls={<button className="btn" onClick={load}>Refresh</button>}
    >
      <div className="kpis">
        <KpiCard label="Non-Compliant Assets" value={kpis.nonCompliant} color={kpis.nonCompliant > 0 ? "hsl(350,100%,65%)" : undefined} />
        <KpiCard label="Total Failed Checks" value={kpis.totalFailed} color={kpis.totalFailed > 0 ? "hsl(25,100%,60%)" : undefined} />
        <KpiCard label="Open Tickets" value={kpis.openTickets} color={kpis.openTickets > 0 ? "hsl(45,100%,50%)" : undefined} />
        <KpiCard label="Unassigned Tickets" value={kpis.unassigned} color={kpis.unassigned > 0 ? "hsl(45,100%,50%)" : undefined} />
      </div>

      {/* My Workload */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="My Workload" subtitle={`Tickets assigned to you (${user?.username}), sorted by age`} />
        {ticketsLoading && <div className="muted">Loading...</div>}
        {!ticketsLoading && myTickets.length === 0 && (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>
            You have no open or in-progress tickets assigned to you. Nice work.
          </div>
        )}
        {!ticketsLoading && myTickets.length > 0 && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {myTickets.slice(0, 10).map((t) => (
                  <tr key={t._id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={`/asset/${encodeURIComponent(t.assetHostname)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                        {t.assetHostname}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{t.title}</td>
                    <td><span className={badgeClass(t.priority)}>{t.priority}</span></td>
                    <td style={{ fontSize: 12 }}>{t.status}</td>
                    <td style={{
                      fontWeight: 700,
                      color: t.ageDays >= 30 ? "hsl(350,100%,65%)" : t.ageDays >= 14 ? "hsl(25,100%,60%)" : t.ageDays >= 7 ? "hsl(45,100%,50%)" : "inherit",
                    }}>
                      {t.ageDays}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 12, textAlign: "right" }}>
          <Link to="/tickets" className="btn" style={{ fontSize: 12 }}>View All Tickets →</Link>
        </div>
      </div>

      {/* Aging breakdown */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="Ticket Aging Across the Fleet" subtitle="How long open/in-progress tickets have been sitting, regardless of assignee" />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <KpiCard label="Fresh (<7d)" value={agingBreakdown.fresh} color="hsl(130,60%,50%)" />
          <KpiCard label="Aging (7-14d)" value={agingBreakdown.aging} color={agingBreakdown.aging > 0 ? "hsl(45,100%,50%)" : undefined} />
          <KpiCard label="Stale (14-30d)" value={agingBreakdown.stale} color={agingBreakdown.stale > 0 ? "hsl(25,100%,60%)" : undefined} />
          <KpiCard label="Critical (30d+)" value={agingBreakdown.critical} color={agingBreakdown.critical > 0 ? "hsl(350,100%,65%)" : undefined} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="Assets Needing Attention" subtitle="Ranked by number of failing CIS checks" />
        {loading && <div className="muted">Loading...</div>}
        {err && <div style={{ color: "crimson" }}>{err}</div>}
        {!loading && !err && worstAssets.length === 0 && (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>
            All monitored assets are currently passing their compliance checks.
          </div>
        )}
        {!loading && worstAssets.length > 0 && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Operating System</th>
                  <th>Failed Checks</th>
                  <th>Compliance Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {worstAssets.map((r) => (
                  <tr key={r.hostname}>
                    <td style={{ fontWeight: 600 }}>{r.hostname}</td>
                    <td style={{ fontSize: 13 }}>{r.os}</td>
                    <td style={{ fontWeight: 700, color: "hsl(350,100%,65%)" }}>{r.compliance?.failedCount ?? 0}</td>
                    <td>{r.compliance?.score != null ? `${r.compliance.score}%` : "-"}</td>
                    <td>
                      <Link to={`/asset/${encodeURIComponent(r.hostname)}`} className="btn" style={{ fontSize: 11, padding: "4px 10px" }}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PATCH OPERATOR — patching-focused summary
// ══════════════════════════════════════════════════════════════════════════════
function PatchOperatorOverview({ rows, loading, err, load }) {
  const [recentPatches, setRecentPatches] = useState([]);
  const [patchesLoading, setPatchesLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/agent/history`, { params: { limit: 8 } })
      .then((res) => setRecentPatches(res.data?.data || []))
      .catch(() => setRecentPatches([]))
      .finally(() => setPatchesLoading(false));
  }, []);

  const kpis = useMemo(() => {
    const totalMissing = rows.reduce((sum, r) => sum + (r?.patch?.missingCount || 0), 0);
    const overdue = rows.filter((r) => {
      const t = r?.patch?.collectedAt;
      if (!t) return true;
      return Date.now() - new Date(t).getTime() > 7 * 24 * 60 * 60 * 1000;
    }).length;
    const upToDate = rows.filter((r) => (r?.patch?.missingCount || 0) === 0).length;
    return { totalMissing, overdue, upToDate, total: rows.length };
  }, [rows]);

  const worstAssets = useMemo(
    () =>
      [...rows]
        .filter((r) => (r?.patch?.missingCount || 0) > 0)
        .sort((a, b) => (b?.patch?.missingCount || 0) - (a?.patch?.missingCount || 0))
        .slice(0, 8),
    [rows],
  );

  return (
    <Layout
      title="Patch Overview"
      rightControls={
        <>
          <button className="btn" onClick={load}>Refresh</button>
          <Link to="/backlog" className="btn">Go to Patch Backlog →</Link>
        </>
      }
    >
      <div className="kpis">
        <KpiCard label="Total Missing Patches" value={kpis.totalMissing} color={kpis.totalMissing > 0 ? "hsl(45,100%,50%)" : undefined} />
        <KpiCard label="Overdue (7+ days)" value={kpis.overdue} color={kpis.overdue > 0 ? "hsl(350,100%,65%)" : undefined} />
        <KpiCard label="Fully Patched" value={kpis.upToDate} color="hsl(130,60%,50%)" />
        <KpiCard label="Total Assets" value={kpis.total} />
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="Assets Needing Patches" subtitle="Ranked by number of missing updates" />
        {loading && <div className="muted">Loading...</div>}
        {err && <div style={{ color: "crimson" }}>{err}</div>}
        {!loading && !err && worstAssets.length === 0 && (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>
            All monitored assets are currently fully patched.
          </div>
        )}
        {!loading && worstAssets.length > 0 && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Operating System</th>
                  <th>Missing Patches</th>
                  <th>Last Collected</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {worstAssets.map((r) => (
                  <tr key={r.hostname}>
                    <td style={{ fontWeight: 600 }}>{r.hostname}</td>
                    <td style={{ fontSize: 13 }}>{r.os}</td>
                    <td style={{ fontWeight: 700, color: "hsl(45,100%,50%)" }}>{r.patch?.missingCount ?? 0}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {r.patch?.collectedAt ? new Date(r.patch.collectedAt).toLocaleString() : "-"}
                    </td>
                    <td>
                      <Link to="/backlog" className="btn" style={{ fontSize: 11, padding: "4px 10px" }}>
                        Patch
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <SectionHeader title="Recent Patch Actions" subtitle="Most recent patch/restart commands you or others have run" />
        {patchesLoading && <div className="muted">Loading...</div>}
        {!patchesLoading && recentPatches.length === 0 && (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>No patch actions recorded yet.</div>
        )}
        {!patchesLoading && recentPatches.length > 0 && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Package/KB</th>
                  <th>Status</th>
                  <th>Performed By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentPatches.map((p) => (
                  <tr key={p._id}>
                    <td style={{ fontWeight: 600 }}>{p.hostname}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{p.kb}</td>
                    <td style={{ fontSize: 12, textTransform: "capitalize" }}>{p.status}</td>
                    <td style={{ fontSize: 12 }}>{p.triggeredBy || "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {new Date(p.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 12, textAlign: "right" }}>
          <Link to="/patch-log" className="btn" style={{ fontSize: 12 }}>View Full Patch Log →</Link>
        </div>
      </div>
    </Layout>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYST — reporting-focused summary (no actions, broad read visibility)
// ══════════════════════════════════════════════════════════════════════════════
function AnalystOverview({ rows, loading, err, load }) {
  const [activityRecords, setActivityRecords] = useState([]);
  const [userSummary, setUserSummary] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/user-activity`, { params: { limit: 1000 } }),
      axios.get(`${API}/api/user-activity/summary`),
    ])
      .then(([listRes, summaryRes]) => {
        setActivityRecords(listRes.data?.data || []);
        setUserSummary(summaryRes.data?.data || []);
      })
      .catch(() => {
        setActivityRecords([]);
        setUserSummary([]);
      })
      .finally(() => setActivityLoading(false));
  }, []);

  const activityStats = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    let loginsToday = 0, loginsThisWeek = 0, failedLoginsToday = 0;
    const activeUsernames = new Set();

    for (const r of activityRecords) {
      const t = new Date(r.createdAt).getTime();
      const isLoginSuccess = r.action === "login_success";
      const isLoginFailed = r.action === "login_failed";

      if (isLoginSuccess && t >= startOfToday.getTime()) loginsToday++;
      if (isLoginSuccess && t >= weekAgo) loginsThisWeek++;
      if (isLoginFailed && t >= startOfToday.getTime()) failedLoginsToday++;
      if (isLoginSuccess && t >= weekAgo) activeUsernames.add(r.username);
    }

    return {
      loginsToday,
      loginsThisWeek,
      failedLoginsToday,
      activeUsers: activeUsernames.size,
    };
  }, [activityRecords]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const nonCompliant = rows.filter((r) => (r?.compliance?.failedCount || 0) > 0).length;
    const totalMissing = rows.reduce((sum, r) => sum + (r?.patch?.missingCount || 0), 0);
    const avgScore = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + (r?.risk?.score || 0), 0) / rows.length)
      : 0;
    return { total, nonCompliant, totalMissing, avgScore };
  }, [rows]);

  return (
    <Layout title="Reporting Overview" rightControls={<button className="btn" onClick={load}>Refresh</button>}>
      <div className="kpis">
        <KpiCard label="Total Assets" value={kpis.total} />
        <KpiCard label="Non-Compliant" value={kpis.nonCompliant} color={kpis.nonCompliant > 0 ? "hsl(350,100%,65%)" : undefined} />
        <KpiCard label="Total Missing Patches" value={kpis.totalMissing} color={kpis.totalMissing > 0 ? "hsl(45,100%,50%)" : undefined} />
        <KpiCard label="Average Risk Score" value={kpis.avgScore} />
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
        <FleetHealth rows={rows} />
        <ActivityFeed rows={rows} />
      </div>

      <TrendChart canSnapshot={false} />

      {loading && <div className="muted">Loading...</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <SectionHeader title="Dashboard Usage Summary" subtitle="Real login activity across all users, computed from actual timestamped records" />
        {activityLoading && <div className="muted">Loading...</div>}
        {!activityLoading && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <KpiCard label="Logins Today" value={activityStats.loginsToday} />
            <KpiCard label="Logins This Week" value={activityStats.loginsThisWeek} />
            <KpiCard label="Failed Logins Today" value={activityStats.failedLoginsToday} color={activityStats.failedLoginsToday > 0 ? "hsl(350,100%,65%)" : undefined} />
            <KpiCard label="Active Users (7d)" value={activityStats.activeUsers} />
          </div>
        )}
      </div>

      <div className="card">
        <SectionHeader title="Per-User Activity" subtitle="Lifetime login and action counts by user" />
        {activityLoading && <div className="muted">Loading...</div>}
        {!activityLoading && userSummary.length === 0 && (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>No activity recorded yet.</div>
        )}
        {!activityLoading && userSummary.length > 0 && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Successful Logins</th>
                  <th>Failed Logins</th>
                  <th>Actions</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {userSummary.map((u) => (
                  <tr key={u.username}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td style={{ fontSize: 12 }}>{u.role}</td>
                    <td>{u.logins}</td>
                    <td style={{ color: u.failedLogins > 0 ? "hsl(350,100%,65%)" : "inherit" }}>{u.failedLogins}</td>
                    <td>{u.actions}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {u.lastSeen ? new Date(u.lastSeen).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 12, textAlign: "right" }}>
          <Link to="/user-activity" className="btn" style={{ fontSize: 12 }}>View Full User Activity →</Link>
        </div>
      </div>
    </Layout>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// Main export — loads shared data once, routes to the correct role dashboard
// ══════════════════════════════════════════════════════════════════════════════
export default function Overview() {
  const { user } = useAuth();
  const role = user?.role || "analyst";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (role === "compliance-officer") {
    return <ComplianceOfficerOverview rows={rows} loading={loading} err={err} load={load} />;
  }
  if (role === "patch-operator") {
    return <PatchOperatorOverview rows={rows} loading={loading} err={err} load={load} />;
  }
  if (role === "analyst") {
    return <AnalystOverview rows={rows} loading={loading} err={err} load={load} />;
  }
  // admin (and any unrecognised role, as a safe default) gets the full dashboard
  return <AdminOverview rows={rows} loading={loading} err={err} load={load} />;
}
