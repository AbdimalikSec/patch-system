import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";


// ── SLA Configuration ─────────────────────────────────────────────────────────
const SLA_HOURS = { Critical: 48, High: 168, Medium: 720, Low: 2160 };

function getSLAStatus(priority, collectedAt) {
  if (!collectedAt || !priority) return null;
  const hours = SLA_HOURS[priority];
  if (!hours) return null;
  const elapsed   = (Date.now() - new Date(collectedAt).getTime()) / 3600000;
  const remaining = hours - elapsed;
  if (remaining < 0)  return { status: "breached", label: `SLA BREACHED ${Math.abs(Math.floor(remaining / 24))}d ago`, color: "hsl(350,100%,65%)" };
  if (remaining < 24) return { status: "due_soon", label: `Due in ${Math.round(remaining)}h`, color: "hsl(25,100%,60%)" };
  return { status: "ok", label: `${Math.floor(remaining / 24)}d remaining`, color: "hsl(130,60%,50%)" };
}

function SLABadge({ priority, collectedAt }) {
  const sla = getSLAStatus(priority, collectedAt);
  if (!sla) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: `${sla.color}22`, color: sla.color,
      border: `1px solid ${sla.color}44`, whiteSpace: "nowrap",
    }}>{sla.label}</span>
  );
}

function normalizeMissingItem(x) {
  if (x == null) return "";
  return String(x).trim();
}

function toLocal(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function rankPriority(p) {
  const map = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  return map[p] || 0;
}

export default function Backlog() {
  const [rows, setRows] = useState([]);
  const [overviewRows, setOverviewRows] = useState([]); // includes risk per asset
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [osFilter, setOsFilter] = useState("All"); // All | windows | linux
  const [riskFilter, setRiskFilter] = useState("All"); // All | Critical | High | Medium | Low

  const [expanded, setExpanded] = useState(() => new Set());
  const [slaFilter, setSlaFilter]     = useState("All"); // hostnames expanded

  async function load() {
    try {
      setErr("");

      // backlog rows (flat)
      const backlogRes = await axios.get(`${API}/api/dashboard/patches/backlog`);
      const backlogData = backlogRes.data?.data || [];

      // overview rows (risk + patch + compliance + last seen per asset)
      // We use this only to align backlog with risk priority.
      const overviewRes = await axios.get(`${API}/api/assets/overview`);
      const overviewData = overviewRes.data?.data || [];

      setRows(backlogData);
      setOverviewRows(overviewData);
    } catch (e) {
      setErr(e?.message || "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Build a hostname->risk map from overview
  const riskByHost = useMemo(() => {
    const map = new Map();
    for (const r of overviewRows) {
      map.set(r.hostname, {
        score: r?.risk?.score ?? null,
        priority: r?.risk?.priority ?? "Low",
      });
    }
    return map;
  }, [overviewRows]);

  // Group backlog items per hostname, attach risk info
  const grouped = useMemo(() => {
    const map = new Map();

    for (const r of rows) {
      const hostname = r.hostname || "unknown";
      const os = (r.os || "-").toLowerCase();
      const collectedAt = r.collectedAt || null;
      const missingItem = normalizeMissingItem(r.missingItem);

      if (!map.has(hostname)) {
        const risk = riskByHost.get(hostname) || { score: null, priority: "Low" };

        map.set(hostname, {
          hostname,
          os,
          latestCollectedAt: collectedAt,
          missingItems: new Set(),
          riskPriority: risk.priority,
          riskScore: risk.score,
        });
      }

      const g = map.get(hostname);

      // Keep OS if first was missing
      if ((g.os === "-" || !g.os) && os) g.os = os;

      // Keep latest collectedAt
      if (collectedAt) {
        const cur = g.latestCollectedAt ? new Date(g.latestCollectedAt).getTime() : 0;
        const nxt = new Date(collectedAt).getTime();
        if (nxt > cur) g.latestCollectedAt = collectedAt;
      }

      if (missingItem) g.missingItems.add(missingItem);
    }

    const list = Array.from(map.values()).map((g) => ({
      ...g,
      missingCount: g.missingItems.size,
      missingList: Array.from(g.missingItems).sort((a, b) => a.localeCompare(b)),
      sla: getSLAStatus(g.riskPriority, g.latestCollectedAt),
    }));

    // Sort by risk priority desc then missingCount desc then hostname
    list.sort((a, b) => {
      const pr = rankPriority(b.riskPriority) - rankPriority(a.riskPriority);
      if (pr !== 0) return pr;
      if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount;
      return (a.hostname || "").localeCompare(b.hostname || "");
    });

    return list;
  }, [rows, riskByHost]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return grouped.filter((g) => {
      const matchesSearch = !qq ? true : (g.hostname || "").toLowerCase().includes(qq);

      const matchesOS =
        osFilter === "All"
          ? true
          : (g.os || "").toLowerCase() === osFilter.toLowerCase();

      const matchesRisk = riskFilter === "All" ? true : g.riskPriority === riskFilter;
      const matchesSLA = slaFilter === "All" || g.sla?.status === slaFilter;

      return matchesSearch && matchesOS && matchesRisk && matchesSLA;
    });
  }, [grouped, q, osFilter, riskFilter]);

  function toggle(hostname) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(hostname)) next.delete(hostname);
      else next.add(hostname);
      return next;
    });
  }

  function exportGroupedCSV() {
    const header = ["hostname", "os", "riskPriority", "riskScore", "missingCount", "collectedAt", "missingItems"];
    const lines = [header.join(",")];

    for (const g of filtered) {
      const line = [
        g.hostname,
        g.os,
        g.riskPriority,
        g.riskScore ?? "",
        g.missingCount,
        g.latestCollectedAt || "",
        g.missingList.join(" | "),
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(",");
      lines.push(line);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "riskpatch_backlog_grouped.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout
      title="Patch Backlog"
      rightControls={
        <>
          <input
            className="input"
            placeholder="Search hostname..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="input"
            style={{ minWidth: 150 }}
            value={osFilter}
            onChange={(e) => setOsFilter(e.target.value)}
            title="Filter OS"
          >
            <option value="All">All OS</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>

          <select
            className="input"
            style={{ minWidth: 160 }}
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            title="Filter Risk Priority"
          >
            <option value="All">All Risk</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <button className="btn" onClick={load}>Refresh</button>
          <button className="btn" onClick={exportGroupedCSV}>Export CSV</button>
          <button className="btn" onClick={() => window.print()}>Export PDF</button>
        </>
      }
    >
      {err && <div style={{ color: "crimson", marginBottom: 10 }}>{err}</div>}

      {/* SLA KPIs */}
      {(() => {
        const breached  = grouped.filter(g => g.sla?.status === "breached").length;
        const dueSoon   = grouped.filter(g => g.sla?.status === "due_soon").length;
        const compliant = grouped.filter(g => g.sla?.status === "ok").length;
        return (
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div className="card" style={{ flex: 1, minWidth: 140, padding: "14px 18px", cursor: "pointer", border: slaFilter === "breached" ? "1px solid hsl(350,100%,65%)" : undefined }}
              onClick={() => setSlaFilter(f => f === "breached" ? "All" : "breached")}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>SLA Breached</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: breached > 0 ? "hsl(350,100%,65%)" : "inherit" }}>{breached}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 140, padding: "14px 18px", cursor: "pointer", border: slaFilter === "due_soon" ? "1px solid hsl(25,100%,60%)" : undefined }}
              onClick={() => setSlaFilter(f => f === "due_soon" ? "All" : "due_soon")}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Due Within 24h</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: dueSoon > 0 ? "hsl(25,100%,60%)" : "inherit" }}>{dueSoon}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 140, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Within SLA</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "hsl(130,60%,50%)" }}>{compliant}</div>
            </div>
            <div className="card" style={{ flex: 2, minWidth: 200, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>SLA Thresholds</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[["Critical","48h"],["High","7d"],["Medium","30d"],["Low","90d"]].map(([p,t]) => (
                  <div key={p} style={{ fontSize: 11 }}>
                    <span className={`badge ${p.toLowerCase()}`} style={{ fontSize: 9, marginRight: 4 }}>{p}</span>
                    <span style={{ color: "var(--muted)" }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}></th>
              <th>Hostname</th>
              <th>OS</th>
              <th>Risk</th>
              <th>SLA</th>
              <th>Missing</th>
              <th>Collected At</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => {
              const isOpen = expanded.has(g.hostname);
              const preview = g.missingList.slice(0, 3).join(", ");
              const more = g.missingCount > 3 ? ` (+${g.missingCount - 3} more)` : "";

              return (
                <>
                  <tr key={g.hostname}>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: "6px 10px" }}
                        onClick={() => toggle(g.hostname)}
                        title={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>

                    <td>{g.hostname}</td>
                    <td>{(g.os || "-").toUpperCase()}</td>

                    <td>
                      <span className={`badge ${(g.riskPriority || "Low").toLowerCase()}`}>
                        {g.riskPriority}
                        {typeof g.riskScore === "number" ? ` (${g.riskScore})` : ""}
                      </span>
                    </td>

                    <td>{g.missingCount}</td>
                    <td className="muted">{toLocal(g.latestCollectedAt)}</td>
                    <td className="muted">
                      {g.missingCount === 0 ? "-" : `${preview}${more}`}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr key={`${g.hostname}-details`}>
                      <td></td>
                      <td colSpan={6}>
                        <div style={{ padding: "10px 0" }}>
                          <div className="muted" style={{ marginBottom: 8 }}>
                            Missing items ({g.missingCount})
                          </div>

                          {g.missingCount === 0 ? (
                            <div className="muted">No missing patches/packages.</div>
                          ) : (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                                gap: 8,
                              }}
                            >
                              {g.missingList.map((item) => (
                                <div
                                  key={`${g.hostname}-${item}`}
                                  style={{
                                    border: "1px solid var(--border)",
                                    borderRadius: 10,
                                    padding: "8px 10px",
                                    background: "var(--card)",
                                  }}
                                >
                                  <div style={{ fontSize: 13 }}>{item}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}