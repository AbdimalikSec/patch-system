import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function ScoreGauge({ score }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 150);
    return () => clearTimeout(t);
  }, [score]);

  const color = score >= 70 ? "hsl(130,60%,50%)"
              : score >= 40 ? "hsl(45,100%,50%)"
              : "hsl(350,100%,65%)";
  const r = 15.9;
  const circ = 2 * Math.PI * r;
  const dash = (animated / 100) * circ;

  return (
    <div style={{ position: "relative", width: 72, height: 72 }}>
      <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
        <circle cx="18" cy="18" r={r} fill="transparent" stroke="var(--line)" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="transparent" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 900, color }}>{score}%</div>
      </div>
    </div>
  );
}

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

function AssetCard({ row, checks, loadingChecks }) {
  const [expanded, setExpanded] = useState(false);

  // All counts derived from live checks array — never from stale API summary
  const checksArr   = checks ?? [];
  const totalChecks = checksArr.length;
  const failedArr   = checksArr.filter(c => c.result === "failed");
  const passedCount = checksArr.filter(c => c.result === "passed").length;
  const failedCount = failedArr.length;
  const naCount     = checksArr.filter(c => c.result === "not applicable").length;
  const denom       = totalChecks - naCount;
  const score       = denom > 0 ? Math.round((passedCount / denom) * 100) : (row.score ?? 0);
  const status      = totalChecks === 0 ? "No Data" : failedCount > 0 ? "Non-Compliant" : "Compliant";
  const topFailed   = failedArr.slice(0, 5);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 20, padding: "18px 24px",
        borderBottom: expanded ? "1px solid var(--line)" : "none"
      }}>
        <ScoreGauge score={score} />

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Link to={`/asset/${encodeURIComponent(row.hostname)}`}
              style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", textDecoration: "none" }}>
              {row.hostname}
            </Link>
            <StatusBadge status={status} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${score}%`,
                background: score >= 70 ? "hsl(130,60%,50%)" : score >= 40 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)",
                borderRadius: 3, transition: "width 1s ease"
              }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {failedCount} failed · {passedCount} passed · {totalChecks} total
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(350,100%,65%)" }}>{failedCount}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Failed</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(130,60%,50%)" }}>{passedCount}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Passed</div>
          </div>
          <button onClick={() => setExpanded(e => !e)} className="btn" style={{ padding: "6px 14px", fontSize: 12 }}>
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "16px 24px" }}>
          {loadingChecks && <div className="muted" style={{ fontSize: 13 }}>Loading checks...</div>}
          {!loadingChecks && topFailed.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>No failed checks found.</div>
          )}
          {!loadingChecks && topFailed.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Top Failed Checks (showing 5 of {failedArr.length})
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {topFailed.map((c, i) => (
                  <div key={i} style={{
                    padding: "10px 14px", background: "var(--surface)", borderRadius: 8,
                    borderLeft: "3px solid hsl(350,100%,65%)", display: "flex", gap: 12, alignItems: "flex-start"
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", minWidth: 50, marginTop: 1 }}>#{c.checkId}</div>
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
                  View all {failedArr.length} failed checks →
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Compliance() {
  const [rows, setRows]                   = useState([]);
  const [checksMap, setChecksMap]         = useState({});
  const [loadingMain, setLoadingMain]     = useState(true);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [q, setQ]                         = useState("");
  const [err, setErr]                     = useState("");

  async function loadSummary() {
    try {
      setLoadingMain(true);
      setErr("");
      const res = await axios.get(`${API}/api/dashboard/compliance/summary`);
      const data = res.data?.data || [];
      setRows(data);
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

  // Fleet KPIs — all from live checksMap
  const kpis = useMemo(() => {
    if (!rows.length) return null;
    const totalChecks  = Object.values(checksMap).reduce((s, arr) => s + arr.length, 0);
    const totalFailed  = Object.values(checksMap).reduce((s, arr) => s + arr.filter(c => c.result === "failed").length, 0);
    const totalPassed  = Object.values(checksMap).reduce((s, arr) => s + arr.filter(c => c.result === "passed").length, 0);
    const nonCompliant = Object.values(checksMap).filter(arr => arr.some(c => c.result === "failed")).length;
    const scores = rows.map(r => {
      const arr   = checksMap[r.hostname] ?? [];
      const p     = arr.filter(c => c.result === "passed").length;
      const na    = arr.filter(c => c.result === "not applicable").length;
      const denom = arr.length - na;
      return denom > 0 ? Math.round((p / denom) * 100) : 0;
    });
    const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    return { avgScore, totalFailed, totalPassed, totalChecks, nonCompliant };
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

      {loadingMain && <div className="muted">Loading compliance data...</div>}
      {!loadingMain && (
        <div style={{ display: "grid", gap: 16 }}>
          {filtered
            .sort((a, b) => {
              const fa = (checksMap[a.hostname] ?? []).filter(c => c.result === "failed").length;
              const fb = (checksMap[b.hostname] ?? []).filter(c => c.result === "failed").length;
              return fb - fa;
            })
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