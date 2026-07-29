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

function exportReportCSV(records, periodLabel) {
  const header = ["Hostname", "Package/KB", "Performed By", "Started", "Completed"];
  const lines = [
    [`Patch Velocity Report — ${periodLabel}`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    header,
  ];
  for (const c of records) {
    lines.push([
      c.hostname,
      c.kb,
      c.triggeredBy || "Unknown",
      new Date(c.createdAt).toLocaleString(),
      c.completedAt ? new Date(c.completedAt).toLocaleString() : "",
    ]);
  }
  const csv = lines
    .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `patch-velocity-report-${new Date().toISOString().slice(0, 10)}.csv`;
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
              <rect x={x} y={y} width={barW} height={barH} fill="hsl(210,100%,60%)" rx="2">
                <title>{date}: {count} patched</title>
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

export default function PatchVelocityReport() {
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

      const res = await axios.get(`${API}/api/agent/reports/patch-velocity`, { params });
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load patch velocity report");
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

  const byOperatorSorted = useMemo(() => {
    if (!data?.byOperator) return [];
    return Object.entries(data.byOperator).sort(([, a], [, b]) => b - a);
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
      title="Patch Velocity Report"
      rightControls={
        <>
          <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>
            Refresh
          </button>
          <button
            className="btn"
            onClick={() => exportReportCSV(data?.records || [], periodLabel)}
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
            <KpiCard label="Total Patches Applied" value={data.totalPatched} color="hsl(210,100%,60%)" />
            <KpiCard label="Machines Patched" value={byMachineSorted.length} />
            <KpiCard label="Operators" value={byOperatorSorted.length} />
            <KpiCard
              label="Stale Machines"
              value={data.staleMachines?.length ?? 0}
              color={(data.staleMachines?.length ?? 0) > 0 ? "hsl(45,100%,50%)" : undefined}
            />
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            Showing data for: <strong style={{ color: "var(--text)" }}>{periodLabel}</strong>
          </div>

          {/* Stale machines alert */}
          {data.staleMachines && data.staleMachines.length > 0 && (
            <div
              className="card"
              style={{
                marginBottom: 24,
                borderColor: "hsl(45,100%,50%)",
                background: "hsla(45,100%,50%,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Stale or Never-Collected Machines</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
                Machines whose patch data hasn't refreshed in 7+ days — the collector or the machine itself may need attention.
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hostname</th>
                      <th>Last Collected</th>
                      <th>Days Since</th>
                      <th>Last Known Missing Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staleMachines.map((m) => (
                      <tr key={m.hostname}>
                        <td style={{ fontWeight: 600 }}>
                          <Link to={`/asset/${encodeURIComponent(m.hostname)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                            {m.hostname}
                          </Link>
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {m.lastCollected ? new Date(m.lastCollected).toLocaleString() : "Never collected"}
                        </td>
                        <td style={{ fontWeight: 700, color: "hsl(45,100%,50%)" }}>
                          {m.daysSince != null ? `${m.daysSince}d` : "—"}
                        </td>
                        <td>{m.missingCount ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Patches Applied Per Day</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
              How many successful patch installs completed each day in this period
            </div>
            {Object.keys(data.byDay || {}).length === 0 ? (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                No patches applied in this period.
              </div>
            ) : (
              <VelocityChart byDay={data.byDay} />
            )}
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
            <div className="card" style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Patches By Machine</div>
              {byMachineSorted.length === 0 ? (
                <div className="muted" style={{ padding: 20, textAlign: "center" }}>No data.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {byMachineSorted.map(([hostname, count]) => {
                    const pct = Math.round((count / data.totalPatched) * 100);
                    return (
                      <div key={hostname}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                          <Link to={`/asset/${encodeURIComponent(hostname)}`} style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
                            {hostname}
                          </Link>
                          <span style={{ fontWeight: 700 }}>{count}</span>
                        </div>
                        <div style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: "hsl(210,100%,60%)", borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card" style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Patches By Operator</div>
              {byOperatorSorted.length === 0 ? (
                <div className="muted" style={{ padding: 20, textAlign: "center" }}>No data.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {byOperatorSorted.map(([who, count]) => {
                    const pct = Math.round((count / data.totalPatched) * 100);
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
              Patches Applied — Detail
            </div>
            {data.records.length === 0 ? (
              <div className="muted" style={{ padding: 24 }}>No patches applied in this period.</div>
            ) : (
              <div className="tableWrap" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Hostname</th>
                      <th>Package/KB</th>
                      <th>Performed By</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records
                      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
                      .map((c) => (
                        <tr key={c._id}>
                          <td style={{ fontWeight: 600 }}>
                            <Link to={`/asset/${encodeURIComponent(c.hostname)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                              {c.hostname}
                            </Link>
                          </td>
                          <td className="mono" style={{ fontSize: 12 }}>{c.kb}</td>
                          <td style={{ fontSize: 12 }}>{c.triggeredBy || "Unknown"}</td>
                          <td className="muted" style={{ fontSize: 12 }}>
                            {c.completedAt ? new Date(c.completedAt).toLocaleString() : "—"}
                          </td>
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
