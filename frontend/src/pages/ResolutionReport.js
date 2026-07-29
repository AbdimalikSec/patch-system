import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const PERIOD_PRESETS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
  { key: "custom", label: "Custom range", days: null },
];

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

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

function priorityColor(p) {
  return { Critical: "hsl(350,100%,65%)", High: "hsl(25,100%,60%)", Medium: "hsl(45,100%,50%)", Low: "hsl(130,60%,50%)" }[p] || "var(--muted)";
}

function exportReportCSV(records, periodLabel, avgResolutionHours) {
  const header = ["Asset", "Check ID", "Title", "Priority", "Assigned To", "Created", "Resolved", "Resolution Time (hrs)"];
  const lines = [
    [`Resolution Velocity Report — ${periodLabel}`],
    [`Generated: ${new Date().toLocaleString()}`],
    [`Average Resolution Time: ${avgResolutionHours != null ? avgResolutionHours.toFixed(1) + " hours" : "N/A"}`],
    [],
    header,
  ];
  for (const t of records) {
    const hrs = t.createdAt && t.resolvedAt
      ? ((new Date(t.resolvedAt) - new Date(t.createdAt)) / (1000 * 60 * 60)).toFixed(1)
      : "";
    lines.push([
      t.assetHostname,
      t.checkId,
      t.title,
      t.priority,
      t.assignedTo || "Unassigned",
      new Date(t.createdAt).toLocaleString(),
      new Date(t.resolvedAt).toLocaleString(),
      hrs,
    ]);
  }
  const csv = lines
    .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resolution-velocity-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function VelocityChart({ byDay }) {
  const entries = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  const max = Math.max(...entries.map(([, v]) => v), 1);
  const W = 800, H = 180;
  const PAD = { top: 10, right: 10, bottom: 30, left: 30 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const barW = Math.max(2, cW / entries.length - 4);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 400, height: "auto" }}>
        {[0, 0.5, 1].map((f) => {
          const val = Math.round(f * max);
          const y = PAD.top + cH - f * cH;
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="4,4" />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: "var(--muted)" }}>{val}</text>
            </g>
          );
        })}
        {entries.map(([date, count], i) => {
          const x = PAD.left + (i / entries.length) * cW + 2;
          const barH = (count / max) * cH;
          const y = PAD.top + cH - barH;
          const showLabel = i % Math.max(1, Math.ceil(entries.length / 8)) === 0;
          return (
            <g key={date}>
              <rect x={x} y={y} width={barW} height={barH} fill="hsl(130,60%,50%)" rx="2">
                <title>{date}: {count} resolved</title>
              </rect>
              {showLabel && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" style={{ fontSize: 8, fill: "var(--muted)" }}>
                  {date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ResolutionReport() {
  const [period, setPeriod] = useState("30");
  const [customSince, setCustomSince] = useState("");
  const [customUntil, setCustomUntil] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const periodLabel = useMemo(() => {
    if (period === "custom") {
      if (!customSince && !customUntil) return "All time";
      return `${customSince || "…"} to ${customUntil || "now"}`;
    }
    const preset = PERIOD_PRESETS.find((p) => p.key === period);
    return preset?.label || "All time";
  }, [period, customSince, customUntil]);

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const params = {};

      if (period === "custom") {
        if (customSince) params.since = new Date(customSince).toISOString();
        if (customUntil) {
          const until = new Date(customUntil);
          until.setHours(23, 59, 59, 999);
          params.until = until.toISOString();
        }
      } else if (period !== "all") {
        const preset = PERIOD_PRESETS.find((p) => p.key === period);
        if (preset?.days) params.since = isoDaysAgo(preset.days);
      }

      const res = await axios.get(`${API}/api/tickets/reports/resolution-velocity`, { params });
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load resolution velocity report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function handleApplyCustom(e) {
    e.preventDefault();
    load();
  }

  const byMachineSorted = useMemo(() => {
    if (!data?.byMachine) return [];
    return Object.entries(data.byMachine).sort(([, a], [, b]) => b - a);
  }, [data]);

  const byAssigneeSorted = useMemo(() => {
    if (!data?.byAssignee) return [];
    return Object.entries(data.byAssignee).sort(([, a], [, b]) => b - a);
  }, [data]);

  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
  };

  return (
    <Layout
      title="Resolution Velocity Report"
      rightControls={
        <>
          <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>
            Refresh
          </button>
          <button
            className="btn"
            onClick={() => exportReportCSV(data?.records || [], periodLabel, data?.avgResolutionHours)}
            disabled={!data || data.records.length === 0}
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            Export Report (CSV)
          </button>
        </>
      }
    >
      {err && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 20,
            background: "hsla(350,100%,65%,0.1)",
            border: "1px solid hsla(350,100%,65%,0.3)",
            color: "hsl(350,100%,65%)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: period === "custom" ? 16 : 0, flexWrap: "wrap" }}>
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`btn-tab ${period === p.key ? "active" : ""}`}
              style={{ fontSize: 12, padding: "7px 14px" }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <form onSubmit={handleApplyCustom} style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <div style={labelStyle}>From</div>
              <input type="date" className="input" value={customSince} onChange={(e) => setCustomSince(e.target.value)} />
            </div>
            <div>
              <div style={labelStyle}>To</div>
              <input type="date" className="input" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} />
            </div>
            <button className="btn" type="submit" style={{ padding: "10px 20px" }}>Apply</button>
          </form>
        )}
      </div>

      {loading && <div className="muted" style={{ padding: 20 }}>Loading report...</div>}

      {!loading && data && (
        <>
          <div className="kpis" style={{ marginBottom: 24 }}>
            <KpiCard label="Total Resolved" value={data.totalResolved} color="hsl(130,60%,50%)" />
            <KpiCard
              label="Avg Resolution Time"
              value={data.avgResolutionHours != null ? `${data.avgResolutionHours.toFixed(1)}h` : "—"}
            />
            <KpiCard label="Machines Involved" value={byMachineSorted.length} />
            <KpiCard label="Contributors" value={byAssigneeSorted.length} />
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            Showing data for: <strong style={{ color: "var(--text)" }}>{periodLabel}</strong>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Resolutions Per Day</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
              How many compliance tickets were resolved each day in this period
            </div>
            {Object.keys(data.byDay || {}).length === 0 ? (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                No tickets resolved in this period.
              </div>
            ) : (
              <VelocityChart byDay={data.byDay} />
            )}
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
            <div className="card" style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Resolutions By Machine</div>
              {byMachineSorted.length === 0 ? (
                <div className="muted" style={{ padding: 20, textAlign: "center" }}>No data.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {byMachineSorted.map(([hostname, count]) => {
                    const pct = Math.round((count / data.totalResolved) * 100);
                    return (
                      <div key={hostname}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                          <Link to={`/asset/${encodeURIComponent(hostname)}`} style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
                            {hostname}
                          </Link>
                          <span style={{ fontWeight: 700 }}>{count}</span>
                        </div>
                        <div style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: "hsl(130,60%,50%)", borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card" style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Resolutions By Contributor</div>
              {byAssigneeSorted.length === 0 ? (
                <div className="muted" style={{ padding: 20, textAlign: "center" }}>No data.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {byAssigneeSorted.map(([who, count]) => {
                    const pct = Math.round((count / data.totalResolved) * 100);
                    return (
                      <div key={who}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>{who}</span>
                          <span style={{ fontWeight: 700 }}>{count}</span>
                        </div>
                        <div style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", fontWeight: 800, fontSize: 15 }}>
              Resolved Tickets — Detail
            </div>
            {data.records.length === 0 ? (
              <div className="muted" style={{ padding: 24 }}>No resolved tickets in this period.</div>
            ) : (
              <div className="tableWrap" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Title</th>
                      <th>Priority</th>
                      <th>Assigned To</th>
                      <th>Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records
                      .sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt))
                      .map((t) => (
                        <tr key={t._id}>
                          <td style={{ fontWeight: 600 }}>
                            <Link to={`/asset/${encodeURIComponent(t.assetHostname)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                              {t.assetHostname}
                            </Link>
                          </td>
                          <td style={{ fontSize: 13 }}>{t.title}</td>
                          <td>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, color: priorityColor(t.priority), background: `${priorityColor(t.priority)}18`, border: `1px solid ${priorityColor(t.priority)}44` }}>
                              {t.priority}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{t.assignedTo || "Unassigned"}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{new Date(t.resolvedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
