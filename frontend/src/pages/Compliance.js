import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function ScoreGauge({ score }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 150);
    return () => clearTimeout(t);
  }, [score]);
  const color = score <= 30 ? "hsl(130,60%,50%)" : score <= 60 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)";
  const r = 15.9, circ = 2 * Math.PI * r, dash = (animated / 100) * circ;
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

function AssetCard({ row, checks, loadingChecks, isAuditor }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll]   = useState(false);
  const checksArr   = checks ?? [];
  const failedArr   = checksArr.filter(c => c.result === "failed");
  const passedCount = checksArr.filter(c => c.result === "passed").length;
  const failedCount = failedArr.length;
  const naCount     = checksArr.filter(c => c.result === "not applicable").length;
  const denom       = checksArr.length - naCount;
  const score = denom > 0 ? Math.round((failedCount / denom) * 100) : (row.score ?? 0);
  const status      = checksArr.length === 0 ? "No Data" : failedCount > 0 ? "Non-Compliant" : "Compliant";
  const displayed   = showAll ? failedArr : failedArr.slice(0, 5);

  

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "18px 24px", borderBottom: expanded ? "1px solid var(--line)" : "none" }}>
        <ScoreGauge score={score} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            {isAuditor
              ? <span style={{ fontWeight: 800, fontSize: 16 }}>{row.hostname}</span>
              : <Link to={`/asset/${encodeURIComponent(row.hostname)}`} style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", textDecoration: "none" }}>{row.hostname}</Link>
            }
            <StatusBadge status={status} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${score}%`, background: score <= 30 ? "hsl(130,60%,50%)" : score <= 60 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)", borderRadius: 3, transition: "width 1s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{failedCount} failed · {passedCount} passed · {checksArr.length} total</div>
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
          {!loadingChecks && failedArr.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No failed checks found.</div>}
          {!loadingChecks && failedArr.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Failed Checks ({showAll ? failedArr.length : `showing 5 of ${failedArr.length}`})
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {displayed.map((c, i) => (
                  <div key={i} style={{ padding: "10px 14px", background: "var(--surface)", borderRadius: 8, borderLeft: "3px solid hsl(350,100%,65%)", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", minWidth: 50, marginTop: 1 }}>#{c.checkId}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.title}</div>
                      {c.rationale && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{c.rationale.slice(0, 180)}{c.rationale.length > 180 ? "…" : ""}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                {!showAll && failedArr.length > 5 && <button className="btn" onClick={() => setShowAll(true)} style={{ fontSize: 12 }}>Show all {failedArr.length} ↓</button>}
                {showAll && <button className="btn" onClick={() => setShowAll(false)} style={{ fontSize: 12 }}>Show less ↑</button>}
                {!isAuditor && <Link to={`/asset/${encodeURIComponent(row.hostname)}`} className="btn" style={{ fontSize: 12 }}>Full asset detail →</Link>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function buildPDFHtml(exportRows, checksMap, kpis, title) {
  const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  const assetSections = exportRows.map(row => {
    const arr    = checksMap[row.hostname] ?? [];
    const failed = arr.filter(c => c.result === "failed");
    const passed = arr.filter(c => c.result === "passed");
    const na     = arr.filter(c => c.result === "not applicable");
    const denom  = arr.length - na.length;
    const score  = denom > 0 ? Math.round((passed.length / denom) * 100) : 0;
    const status = failed.length > 0 ? "Non-Compliant" : arr.length === 0 ? "No Data" : "Compliant";
    const sc     = failed.length > 0 ? "#dc2626" : "#16a34a";

    const failedRows = failed.map(c => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#666;white-space:nowrap;">#${c.checkId}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:600;">${c.title || "-"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#666;">${(c.rationale || "").slice(0, 200)}${(c.rationale || "").length > 200 ? "…" : ""}</td>
      </tr>`).join("");

    return `
      <div style="margin-bottom:40px;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#f8f9fa;border-radius:8px;margin-bottom:16px;border-left:4px solid ${sc};">
          <div>
            <div style="font-size:18px;font-weight:800;">${row.hostname}</div>
            <div style="font-size:12px;color:#666;margin-top:4px;">${failed.length} failed · ${passed.length} passed · ${arr.length} total</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:28px;font-weight:900;color:${sc};">${score}%</div>
            <div style="font-size:11px;font-weight:700;color:${sc};text-transform:uppercase;">${status}</div>
          </div>
        </div>
        ${failed.length === 0
          ? `<div style="padding:16px;color:#16a34a;font-size:13px;">✓ No failed checks for this asset.</div>`
          : `<table style="width:100%;border-collapse:collapse;">
              <thead><tr style="background:#f0f0f0;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;width:80px;">Check ID</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;width:38%;">Title</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">Rationale</th>
              </tr></thead>
              <tbody>${failedRows}</tbody>
             </table>`
        }
      </div>`;
  }).join("");

  // Summary KPIs — recalculate for the exported rows only
  const expFailed  = exportRows.reduce((s, r) => s + (checksMap[r.hostname] ?? []).filter(c => c.result === "failed").length, 0);
  const expPassed  = exportRows.reduce((s, r) => s + (checksMap[r.hostname] ?? []).filter(c => c.result === "passed").length, 0);
  const expTotal   = exportRows.reduce((s, r) => s + (checksMap[r.hostname] ?? []).length, 0);
  const expNonComp = exportRows.filter(r => (checksMap[r.hostname] ?? []).some(c => c.result === "failed")).length;
  const expScores  = exportRows.map(r => {
    const arr = checksMap[r.hostname] ?? [];
    const p   = arr.filter(c => c.result === "passed").length;
    const na  = arr.filter(c => c.result === "not applicable").length;
    const d   = arr.length - na;
    return d > 0 ? Math.round((p / d) * 100) : 0;
  });
  const expAvg = expScores.length ? Math.round(expScores.reduce((s, v) => s + v, 0) / expScores.length) : 0;
  const avgColor = expAvg >= 70 ? "#16a34a" : expAvg >= 40 ? "#d97706" : "#dc2626";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title} — RiskPatch</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:40px;max-width:1100px;margin:0 auto;}@media print{body{padding:20px;}.no-print{display:none;}}</style>
</head><body>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:24px;border-bottom:2px solid #111;margin-bottom:32px;">
    <div>
      <div style="font-size:28px;font-weight:900;">🛡 RiskPatch</div>
      <div style="font-size:14px;color:#666;margin-top:4px;">${title}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:13px;color:#666;">Generated: ${date}</div>
      <div style="font-size:13px;color:#666;margin-top:4px;">Assets covered: ${exportRows.length}</div>
    </div>
  </div>
  <div class="no-print" style="margin-bottom:24px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;">
    ${[
      ["Fleet Avg Score", `${expAvg}%`, avgColor],
      ["Non-Compliant", `${expNonComp} / ${exportRows.length}`, expNonComp > 0 ? "#dc2626" : "#16a34a"],
      ["Total Failed", `${expFailed}`, "#dc2626"],
      ["Total Checks", `${expTotal}`, "#111"],
    ].map(([label, val, color]) => `
      <div style="padding:16px 20px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e5e5;">
        <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${label}</div>
        <div style="font-size:28px;font-weight:900;color:${color};">${val}</div>
      </div>`).join("")}
  </div>
  <div style="font-size:18px;font-weight:800;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #e5e5e5;">Asset Compliance Details</div>
  ${assetSections}
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;">RiskPatch — Intelligent Risk-Based Patch Management & Compliance Framework · ${date}</div>
</body></html>`;
}

function DomainCard({ domain, checks, isAuditor }) {
  const [open, setOpen] = useState(false);
  const [showResult, setShowResult] = useState("failed");
  const failed = checks.filter(c => c.result === "failed").length;
  const passed = checks.filter(c => c.result === "passed").length;
  const total  = checks.length;
  const score = total > 0 ? Math.round((failed / total) * 100) : 0;

  return (
    <div key={domain} className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 24px", cursor: "pointer" }}
        onClick={() => setOpen(o => !o)}>
        <ScoreGauge score={score} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{domain}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {failed} failed · {passed} passed · {total} mapped checks
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "hsl(350,100%,65%)" }}>{failed}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Failed</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "hsl(130,60%,50%)" }}>{passed}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Passed</div>
          </div>
          <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }}>
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>
  {open && (
  <div style={{ padding: "0 24px 16px", borderTop: "1px solid var(--line)" }}>
    <div style={{ display: "flex", gap: 6, marginTop: 12, marginBottom: 12 }}>
      {["failed", "passed"].map(r => (
        <button key={r} onClick={e => { e.stopPropagation(); setShowResult(r); }}
          className={`btn-tab ${showResult === r ? "active" : ""}`}
          style={{ fontSize: 11, padding: "5px 12px" }}>
          {r === "failed" ? `Failed (${checks.filter(c => c.result === "failed").length})` : `Passed (${checks.filter(c => c.result === "passed").length})`}
        </button>
      ))}
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      {checks.filter(c => c.result === showResult).map((c, i) => (
        <div key={i} style={{
          padding: "10px 14px", background: "var(--surface)", borderRadius: 8,
          borderLeft: `3px solid ${showResult === "failed" ? "hsl(350,100%,65%)" : "hsl(130,60%,50%)"}`,
          display: "flex", gap: 12, alignItems: "flex-start"
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", minWidth: 60, marginTop: 1 }}>
            {c.iso27001.control}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{c.title}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              Asset: {c.assetHostname} · Check #{c.checkId}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
    </div>
  );
}

function ISOView({ checksMap, rows, isAuditor }) {
  const allChecks = useMemo(() => {
    const out = [];
    for (const row of rows) {
      const checks = checksMap[row.hostname] ?? [];
      for (const c of checks) {
        if (c.iso27001) out.push({ ...c, assetHostname: row.hostname });
      }
    }
    return out;
  }, [checksMap, rows]);

  const byDomain = useMemo(() => {
    const map = {};
    for (const c of allChecks) {
      const domain = c.iso27001.domain;
      if (!map[domain]) map[domain] = { domain, checks: [] };
      map[domain].checks.push(c);
    }
    return Object.values(map).sort((a, b) => a.domain.localeCompare(b.domain));
  }, [allChecks]);

  const mappedFailed = allChecks.filter(c => c.result === "failed").length;
  const mappedPassed = allChecks.filter(c => c.result === "passed").length;

  return (
    <div>
      <div className="kpis" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="cardLabel">ISO 27001 Domains Covered</div>
          <div className="cardValue">{byDomain.length}</div>
        </div>
        <div className="card">
          <div className="cardLabel">Mapped Checks</div>
          <div className="cardValue">{allChecks.length}</div>
        </div>
        <div className="card">
          <div className="cardLabel">Failed (ISO-mapped)</div>
          <div className="cardValue" style={{ color: "hsl(350,100%,65%)" }}>{mappedFailed}</div>
        </div>
        <div className="card">
          <div className="cardLabel">Passed (ISO-mapped)</div>
          <div className="cardValue" style={{ color: "hsl(130,60%,50%)" }}>{mappedPassed}</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {byDomain.map(({ domain, checks }) => (
          <DomainCard key={domain} domain={domain} checks={checks} isAuditor={isAuditor} />
        ))}
      </div>

      {allChecks.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          No ISO 27001 mapped checks found. Make sure the backend is updated and compliance data is loaded.
        </div>
      )}
    </div>
  );
}


export default function Compliance() {
  const { user } = useAuth();
  const isAuditor = user?.role === "auditor";
  const [rows, setRows]               = useState([]);
  const [checksMap, setChecksMap]     = useState({});
  const [loadingMain, setLoadingMain] = useState(true);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [q, setQ]                     = useState("");
  const [err, setErr]                 = useState("");
  const [exportTarget, setExportTarget] = useState("all"); // "all" or hostname
  const [framework, setFramework] = useState("cis");

  async function loadSummary() {
    try {
      setLoadingMain(true);
      setErr("");
      const res  = await axios.get(`${API}/api/dashboard/compliance/summary`);
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
    await Promise.all(hostnames.map(async h => {
      try {
        const res = await axios.get(`${API}/api/compliance/checks/${encodeURIComponent(h)}`);
        results[h] = res.data?.data || [];
      } catch { results[h] = []; }
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

  const sortedFiltered = useMemo(() => [...filtered].sort((a, b) => {
    const fa = (checksMap[a.hostname] ?? []).filter(c => c.result === "failed").length;
    const fb = (checksMap[b.hostname] ?? []).filter(c => c.result === "failed").length;
    return fb - fa;
  }), [filtered, checksMap]);

  const kpis = useMemo(() => {
    if (!rows.length) return null;
    const totalChecks  = Object.values(checksMap).reduce((s, arr) => s + arr.length, 0);
    const totalFailed  = Object.values(checksMap).reduce((s, arr) => s + arr.filter(c => c.result === "failed").length, 0);
    const totalPassed  = Object.values(checksMap).reduce((s, arr) => s + arr.filter(c => c.result === "passed").length, 0);
    const nonCompliant = Object.values(checksMap).filter(arr => arr.some(c => c.result === "failed")).length;
    const scores = rows.map(r => {
      const arr = checksMap[r.hostname] ?? [];
      const p   = arr.filter(c => c.result === "passed").length;
      const na  = arr.filter(c => c.result === "not applicable").length;
      const d   = arr.length - na;
      return d > 0 ? Math.round((p / d) * 100) : 0;
    });
    const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    return { avgScore, totalFailed, totalPassed, totalChecks, nonCompliant };
  }, [rows, checksMap]);

  function handleExport() {
    const exportRows = exportTarget === "all"
      ? sortedFiltered
      : sortedFiltered.filter(r => r.hostname === exportTarget);
    const title = exportTarget === "all"
      ? "CIS Compliance Audit Report — All Assets"
      : `CIS Compliance Report — ${exportTarget}`;
    const win = window.open("", "_blank");
    win.document.write(buildPDFHtml(exportRows, checksMap, kpis, title));
    win.document.close();
  }

  return (
    <Layout
      title="CIS Compliance"
      rightControls={
        <>
           <input className="input" placeholder="Search hostname..." value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
            {[["cis", "CIS Benchmark"], ["iso", "ISO 27001"]].map(([key, label]) => (
              <button key={key} onClick={() => setFramework(key)}
                style={{
                  padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                  background: framework === key ? "var(--accent)" : "transparent",
                  color: framework === key ? "#fff" : "var(--muted)",
                }}>
                {label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={loadSummary}>Refresh</button>
          <select className="input" value={exportTarget} onChange={e => setExportTarget(e.target.value)} style={{ minWidth: 160 }}>
            <option value="all">All Assets</option>
            {rows.map(r => <option key={r.hostname} value={r.hostname}>{r.hostname}</option>)}
          </select>
          <button className="btn" onClick={handleExport}>Export PDF</button>
        </>
      }
    >
      {err && <div style={{ color: "crimson", marginBottom: 16 }}>{err}</div>}
      {kpis && (
        <div className="kpis" style={{ marginBottom: 24 }}>
          <div className="card"><div className="cardLabel">Fleet Avg Score</div>
            <div className="cardValue" style={{ color: kpis.avgScore >= 70 ? "hsl(130,60%,50%)" : kpis.avgScore >= 40 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)" }}>{kpis.avgScore}%</div>
          </div>
          <div className="card"><div className="cardLabel">Non-Compliant Assets</div>
            <div className="cardValue" style={{ color: kpis.nonCompliant > 0 ? "hsl(350,100%,65%)" : "inherit" }}>{kpis.nonCompliant} / {rows.length}</div>
          </div>
          <div className="card"><div className="cardLabel">Total Failed Checks</div>
            <div className="cardValue" style={{ color: "hsl(350,100%,65%)" }}>{kpis.totalFailed}</div>
          </div>
          <div className="card"><div className="cardLabel">Total Checks Evaluated</div>
            <div className="cardValue">{kpis.totalChecks}</div>
            {kpis.totalChecks > 0 && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{kpis.totalPassed} passed · {kpis.totalFailed} failed</div>}
          </div>
        </div>
      )}
      {loadingMain && <div className="muted">Loading compliance data...</div>}
      {!loadingMain && (
        <div style={{ display: "grid", gap: 16 }}>
           {framework === "cis"
            ? sortedFiltered.map(row => (
                <AssetCard key={row.hostname} row={row} checks={checksMap[row.hostname]}
                  loadingChecks={loadingChecks && !checksMap[row.hostname]} isAuditor={isAuditor} />
              ))
            : <ISOView checksMap={checksMap} rows={sortedFiltered} isAuditor={isAuditor} />
          }
        </div>
      )}
    </Layout>
  );
}