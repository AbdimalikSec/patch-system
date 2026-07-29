import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

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

function trendVerdict(points) {
  // Needs at least 2 points to say anything about direction.
  if (!points || points.length < 2) {
    return { label: "Not enough data", color: "var(--muted)", delta: null };
  }
  const first = points[0].failedCount ?? 0;
  const last = points[points.length - 1].failedCount ?? 0;
  const delta = last - first;

  if (delta < 0) return { label: "Improving", color: "hsl(130,60%,50%)", delta };
  if (delta > 0) return { label: "Degrading", color: "hsl(350,100%,65%)", delta };
  return { label: "Stable", color: "hsl(45,100%,50%)", delta };
}

function exportReportCSV(grouped, days) {
  const header = ["Hostname", "Date", "Failed Checks", "Risk Score", "Priority", "Missing Patches"];
  const lines = [
    [`Compliance Trend Report — Last ${days} days`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    header,
  ];
  for (const [hostname, points] of Object.entries(grouped)) {
    for (const p of points) {
      lines.push([hostname, p.date, p.failedCount ?? "", p.score ?? "", p.priority ?? "", p.missingCount ?? ""]);
    }
  }
  const csv = lines
    .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compliance-trend-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Small per-machine sparkline of failedCount over time ───────────────────────
function Sparkline({ points }) {
  if (!points || points.length === 0) return null;
  const W = 160, H = 40;
  const values = points.map((p) => p.failedCount ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const path = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * W;
      const y = H - ((p.failedCount - min) / range) * H;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const lastUp = points.length >= 2 && (points[points.length - 1].failedCount ?? 0) > (points[0].failedCount ?? 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 160, height: 40 }}>
      <path d={path} fill="none" stroke={lastUp ? "hsl(350,100%,65%)" : "hsl(130,60%,50%)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ComplianceTrendReport() {
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/snapshots/history`, { params: { days } });
      setHistory(res.data?.data || {});
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load compliance trend report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const machineRows = useMemo(() => {
    return Object.entries(history).map(([hostname, points]) => {
      const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
      const verdict = trendVerdict(sorted);
      const latest = sorted[sorted.length - 1] || {};
      return { hostname, points: sorted, verdict, latest };
    });
  }, [history]);

  const summary = useMemo(() => {
    const improving = machineRows.filter((m) => m.verdict.label === "Improving").length;
    const degrading = machineRows.filter((m) => m.verdict.label === "Degrading").length;
    const stable = machineRows.filter((m) => m.verdict.label === "Stable").length;
    return { improving, degrading, stable, total: machineRows.length };
  }, [machineRows]);

  const hasData = machineRows.some((m) => m.points.length > 0);

  return (
    <Layout
      title="Compliance Trend Report"
      rightControls={
        <>
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAYS_OPTIONS.map((d) => (
              <option key={d} value={d}>Last {d} days</option>
            ))}
          </select>
          <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>
            Refresh
          </button>
          <button
            className="btn"
            onClick={() => exportReportCSV(history, days)}
            disabled={!hasData}
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

      {loading && <div className="muted" style={{ padding: 20 }}>Loading report...</div>}

      {!loading && !hasData && (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>No trend data yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Snapshots need to be recorded (via the Overview page or scheduled job) before a trend can be shown.
          </div>
        </div>
      )}

      {!loading && hasData && (
        <>
          <div className="kpis" style={{ marginBottom: 24 }}>
            <KpiCard label="Total Machines" value={summary.total} />
            <KpiCard label="Improving" value={summary.improving} color="hsl(130,60%,50%)" />
            <KpiCard label="Degrading" value={summary.degrading} color={summary.degrading > 0 ? "hsl(350,100%,65%)" : undefined} />
            <KpiCard label="Stable" value={summary.stable} color="hsl(45,100%,50%)" />
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            Showing data for: <strong style={{ color: "var(--text)" }}>Last {days} days</strong>. Trend is based on change in failed CIS checks from the first to the most recent snapshot in this period.
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", fontWeight: 800, fontSize: 15 }}>
              Per-Machine Compliance Trend
            </div>
            <div className="tableWrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>Trend</th>
                    <th>Change</th>
                    <th>Current Failed Checks</th>
                    <th>Current Risk Score</th>
                    <th>History</th>
                  </tr>
                </thead>
                <tbody>
                  {machineRows
                    .sort((a, b) => {
                      // Degrading first (needs attention), then stable, then improving
                      const rank = { Degrading: 0, Stable: 1, Improving: 2, "Not enough data": 3 };
                      return (rank[a.verdict.label] ?? 4) - (rank[b.verdict.label] ?? 4);
                    })
                    .map((m) => (
                      <tr key={m.hostname}>
                        <td style={{ fontWeight: 600 }}>
                          <Link to={`/asset/${encodeURIComponent(m.hostname)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                            {m.hostname}
                          </Link>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "3px 10px",
                              borderRadius: 4,
                              color: m.verdict.color,
                              background: `${m.verdict.color}18`,
                              border: `1px solid ${m.verdict.color}44`,
                            }}
                          >
                            {m.verdict.label}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: m.verdict.delta > 0 ? "hsl(350,100%,65%)" : m.verdict.delta < 0 ? "hsl(130,60%,50%)" : "inherit" }}>
                          {m.verdict.delta != null ? (m.verdict.delta > 0 ? `+${m.verdict.delta}` : m.verdict.delta) : "—"}
                        </td>
                        <td>{m.latest.failedCount ?? "—"}</td>
                        <td>{m.latest.score ?? "—"}</td>
                        <td><Sparkline points={m.points} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
