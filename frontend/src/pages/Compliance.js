import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

// ── Score gauge ───────────────────────────────────────────────────────────────
function ScoreGauge({ score }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 150);
    return () => clearTimeout(t);
  }, [score]);

  const color = score >= 70 ? "hsl(130,60%,50%)"
              : score >= 40 ? "hsl(45,100%,50%)"
              : "hsl(350,100%,65%)";

  const pct = animated;
  const r = 15.9;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div style={{ position: "relative", width: 72, height: 72 }}>
      <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
        <circle cx="18" cy="18" r={r} fill="transparent" stroke="var(--line)" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="transparent" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", flexDirection: "column"
      }}>
        <div style={{ fontSize: 14, fontWeight: 900, color }}>{score}%</div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const colors = {
    "Compliant":     { bg: "hsla(130,60%,50%,0.15)", border: "hsl(130,60%,50%)", text: "hsl(130,60%,50%)" },
    "Non-Compliant": { bg: "hsla(350,100%,65%,0.15)", border: "hsl(350,100%,65%)", text: "hsl(350,100%,65%)" },
    "No Data":       { bg: "hsla(0,0%,60%,0.1)",      border: "hsl(0,0%,50%)",    text: "hsl(0,0%,60%)"    },
  };
  const c = colors[status] || colors["No Data"];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap"
    }}>{status}</span>
  );
}

// ── Asset compliance card ─────────────────────────────────────────────────────
function AssetCard({ row, checks, loadingChecks }) {
  const [expanded, setExpanded] = useState(false);

  const passedCount  = row.failedCount != null ? (checks?.filter(c => c.result === "passed").length  ?? 0) : 0;
  const totalChecks  = checks?.length ?? 0;
  const failedChecks = checks?.filter(c => c.result === "failed")  ?? [];
  const topFailed    = failedChecks.slice(0, 5);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, padding: "18px 24px",
        borderBottom: expanded ? "1px solid var(--line)" : "none"
      }}>
        <ScoreGauge score={row.score ?? 0} />

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Link to={`/asset/${encodeURIComponent(row.hostname)}`}
              style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", textDecoration: "none" }}>
              {row.hostname}
            </Link>
            <StatusBadge status={row.status} />
          </div>

          {/* Pass/fail bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${row.score ?? 0}%`,
                background: row.score >= 70 ? "hsl(130,60%,50%)" : row.score >= 40 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)",
                borderRadius: 3, transition: "width 1s ease"
              }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {row.failedCount ?? 0} failed
              {totalChecks > 0 && ` · ${passedCount} passed · ${totalChecks} total`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(350,100%,65%)" }}>{row.failedCount ?? "-"}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Failed</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(130,60%,50%)" }}>{passedCount || "-"}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Passed</div>
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="btn"
            style={{ padding: "6px 14px", fontSize: 12 }}
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {/* Expanded checks */}
      {expanded && (
        <div style={{ padding: "16px 24px" }}>
          {loadingChecks && <div className="muted" style={{ fontSize: 13 }}>Loading checks...</div>}
          {!loadingChecks && topFailed.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>No failed checks found.</div>
          )}
          {!loadingChecks && topFailed.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Top Failed Checks (showing 5 of {failedChecks.length})
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {topFailed.map((c, i) => (
                  <div key={i} style={{
                    padding: "10px 14px", background: "var(--surface)", borderRadius: 8,
                    borderLeft: "3px solid hsl(350,100%,65%)", display: "flex", gap: 12, alignItems: "flex-start"
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", minWidth: 50, marginTop: 1 }}>
                      #{c.checkId}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.title}</div>
                      {c.rationale && (
                        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
                          {c.rationale.slice(0, 150)}{c.rationale.length > 150 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <Link to={`/asset/${encodeURIComponent(row.hostname)}`} className="btn" style={{ fontSize: 12 }}>
                  View all {failedChecks.length} failed checks →
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Compliance() {
  const [rows, setRows]           = useState([]);
  const [checksMap, setChecksMap] = useState({});
  const [loadingMain, setLoadingMain] = useState(true);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [q, setQ]                 = useState("");
  const [err, setErr]             = useState("");

  async function loadSummary() {
    try {
      setLoadingMain(true);
      setErr("");
      const res = await axios.get(`${API}/api/dashboard/compliance/summary`);
      const data = res.data?.data || [];
      setRows(data);
      // Load checks for all assets in background
      loadAllChecks(data.map(r => r.hostname));
    } catch (e) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoadingMain(false);
    }
  }

  async function loadAllChecks(hostnames) {
    setLoadingChecks(true);
    const results = {};
    await Promise.all(hostnames.map(async (hostname) => {
      try {
        const res = await axios.get(`${API}/api/compliance/checks/${encodeURIComponent(hostname)}`);
        results[hostname] = res.data?.data || [];
      } catch {
        results[hostname] = [];
      }
    }));
    setChecksMap(results);
    setLoadingChecks(false);
  }

  useEffect(() => { loadSummary(); }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter(r => (r.hostname || "").toLowerCase().includes(qq));
  }, [rows, q]);

  // ── Fleet-wide KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!rows.length) return null;
    const avgScore    = Math.round(rows.reduce((s, r) => s + (r.score ?? 0), 0) / rows.length);
    const totalFailed = rows.reduce((s, r) => s + (r.failedCount ?? 0), 0);
    const nonCompliant = rows.filter(r => r.status === "Non-Compliant").length;

    // Total checks across all assets
    const totalChecks = Object.values(checksMap).reduce((s, arr) => s + arr.length, 0);
    const totalPassed = Object.values(checksMap).reduce((s, arr) => s + arr.filter(c => c.result === "passed").length, 0);

    return { avgScore, totalFailed, nonCompliant, totalChecks, totalPassed };
  }, [rows, checksMap]);

  return (
    <Layout
      title="CIS Compliance"
      rightControls={
        <>
          <input className="input" placeholder="Search hostname..." value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn" onClick={loadSummary}>Refresh</button>
          <button className="btn" onClick={() => window.print()}>Export PDF</button>
        </>
      }
    >
      {err && <div style={{ color: "crimson", marginBottom: 16 }}>{err}</div>}

      {/* KPIs */}
      {kpis && (
        <div className="kpis" style={{ marginBottom: 24 }}>
          <div className="card">
            <div className="cardLabel">Fleet Avg Score</div>
            <div className="cardValue" style={{ color: kpis.avgScore >= 70 ? "hsl(130,60%,50%)" : kpis.avgScore >= 40 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)" }}>
              {kpis.avgScore}%
            </div>
          </div>
          <div className="card">
            <div className="cardLabel">Non-Compliant Assets</div>
            <div className="cardValue" style={{ color: kpis.nonCompliant > 0 ? "hsl(350,100%,65%)" : "inherit" }}>
              {kpis.nonCompliant} / {rows.length}
            </div>
          </div>
          <div className="card">
            <div className="cardLabel">Total Failed Checks</div>
            <div className="cardValue" style={{ color: "hsl(350,100%,65%)" }}>{kpis.totalFailed}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Total Checks Evaluated</div>
            <div className="cardValue">{kpis.totalChecks}</div>
            {kpis.totalChecks > 0 && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                {kpis.totalPassed} passed · {kpis.totalFailed} failed
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asset cards */}
      {loadingMain && <div className="muted">Loading compliance data...</div>}
      {!loadingMain && (
        <div style={{ display: "grid", gap: 16 }}>
          {filtered
            .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)) // worst first
            .map(row => (
              <AssetCard
                key={row.hostname}
                row={row}
                checks={checksMap[row.hostname]}
                loadingChecks={loadingChecks && !checksMap[row.hostname]}
              />
            ))
          }
        </div>
      )}
    </Layout>
  );
}