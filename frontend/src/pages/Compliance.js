import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

// ── Restrained palette: neutral everywhere, color reserved only for real
// status — one red for failing, one green for passing. Nothing else in
// this page should ever introduce a third color.
const RED = "#C0392B";
const RED_BG = "#FDEDEC";
const GREEN = "#1E8449";
const GREEN_BG = "#EAFAF1";
const NEUTRAL_TEXT = "var(--text)";
const NEUTRAL_MUTED = "var(--muted)";

function StatusPill({ status }) {
  const styles = {
    "Compliant":     { bg: GREEN_BG, color: GREEN },
    "Non-Compliant": { bg: RED_BG, color: RED },
    "No Data":       { bg: "var(--surface)", color: "var(--muted)" },
  };
  const s = styles[status] || styles["No Data"];
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 4,
      background: s.bg, color: s.color, letterSpacing: "0.02em",
    }}>{status}</span>
  );
}

// Flat progress bar replacing the circular gauge — matches how real
// compliance dashboards (Intune, Qualys) present a percentage: plainly.
function ScoreBar({ score }) {
  const color = score === 0 ? GREEN : score <= 30 ? "#D68910" : RED;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 140 }}>
      <div style={{ flex: 1, height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(score, 100)}%`, background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: NEUTRAL_TEXT, minWidth: 34, textAlign: "right" }}>{score}%</div>
    </div>
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
    <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 20px", borderBottom: expanded ? "1px solid var(--line)" : "none" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            {isAuditor
              ? <span style={{ fontWeight: 700, fontSize: 14 }}>{row.hostname}</span>
              : <Link to={`/asset/${encodeURIComponent(row.hostname)}`} style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", textDecoration: "none" }}>{row.hostname}</Link>
            }
            <StatusPill status={status} />
          </div>
          <ScoreBar score={score} />
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: failedCount > 0 ? RED : NEUTRAL_TEXT }}>{failedCount}</div>
            <div style={{ fontSize: 10, color: NEUTRAL_MUTED, textTransform: "uppercase" }}>Failed</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: NEUTRAL_TEXT }}>{passedCount}</div>
            <div style={{ fontSize: 10, color: NEUTRAL_MUTED, textTransform: "uppercase" }}>Passed</div>
          </div>
          <button onClick={() => setExpanded(e => !e)}
            style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", cursor: "pointer" }}>
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "14px 20px" }}>
          {loadingChecks && <div className="muted" style={{ fontSize: 13 }}>Loading checks...</div>}
          {!loadingChecks && failedArr.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No failed checks found.</div>}
          {!loadingChecks && failedArr.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: NEUTRAL_MUTED, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Failed Checks ({showAll ? failedArr.length : `showing 5 of ${failedArr.length}`})
              </div>
              <div style={{ display: "grid", gap: 1, border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                {displayed.map((c, i) => (
                  <div key={i} style={{ padding: "10px 14px", background: i % 2 === 0 ? "var(--panel)" : "var(--surface)", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: NEUTRAL_MUTED, minWidth: 46, marginTop: 1 }}>#{c.checkId}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.title}</div>
                      {c.rationale && <div style={{ fontSize: 11.5, color: NEUTRAL_MUTED, lineHeight: 1.5 }}>{c.rationale.slice(0, 180)}{c.rationale.length > 180 ? "…" : ""}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                {!showAll && failedArr.length > 5 && (
                  <button onClick={() => setShowAll(true)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--line)", cursor: "pointer" }}>Show all {failedArr.length}</button>
                )}
                {showAll && (
                  <button onClick={() => setShowAll(false)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--line)", cursor: "pointer" }}>Show less</button>
                )}
                {!isAuditor && (
                  <Link to={`/asset/${encodeURIComponent(row.hostname)}`} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", textDecoration: "none" }}>Full asset detail →</Link>
                )}
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
<title>${title} - Triarch</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:40px;max-width:1100px;margin:0 auto;}@media print{body{padding:20px;}.no-print{display:none;}}</style>
</head><body>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:24px;border-bottom:2px solid #111;margin-bottom:32px;">
    <div>
      <div style="font-size:28px;font-weight:900;">🛡 Triarch</div>
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
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;">Triarch - Intelligent Risk-Based Patch Management & Compliance Framework · ${date}</div>
</body></html>`;
}

function buildISOPDFHtml(exportRows, checksMap, title) {
  const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  const allChecks = [];
  for (const row of exportRows) {
    const checks = checksMap[row.hostname] ?? [];
    for (const c of checks) {
      if (c.iso27001) allChecks.push({ ...c, assetHostname: row.hostname });
    }
  }

  const byDomain = {};
  for (const c of allChecks) {
    const domain = c.iso27001.domain;
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(c);
  }
  const domains = Object.keys(byDomain).sort();

  const domainSections = domains.map(domain => {
    const checks = byDomain[domain];
    const failed = checks.filter(c => c.result === "failed");
    const passed = checks.filter(c => c.result === "passed");
    const score = checks.length > 0 ? Math.round((failed.length / checks.length) * 100) : 0;
    const sc = failed.length > 0 ? "#dc2626" : "#16a34a";

    const failedRows = failed.map(c => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#666;white-space:nowrap;">${c.iso27001.control}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:600;">${c.title || "-"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#666;">${c.assetHostname} · Check #${c.checkId}</td>
      </tr>`).join("");

    return `
      <div style="margin-bottom:40px;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#f8f9fa;border-radius:8px;margin-bottom:16px;border-left:4px solid ${sc};">
          <div>
            <div style="font-size:18px;font-weight:800;">${domain}</div>
            <div style="font-size:12px;color:#666;margin-top:4px;">${failed.length} failed · ${passed.length} passed · ${checks.length} mapped checks</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:28px;font-weight:900;color:${sc};">${score}%</div>
            <div style="font-size:11px;font-weight:700;color:${sc};text-transform:uppercase;">${failed.length > 0 ? "Non-Compliant" : "Compliant"}</div>
          </div>
        </div>
        ${failed.length === 0
          ? `<div style="padding:16px;color:#16a34a;font-size:13px;">✓ No failed checks mapped to this domain.</div>`
          : `<table style="width:100%;border-collapse:collapse;">
              <thead><tr style="background:#f0f0f0;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;width:100px;">Control</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;width:40%;">Title</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">Asset / Check</th>
              </tr></thead>
              <tbody>${failedRows}</tbody>
             </table>`
        }
      </div>`;
  }).join("");

  const totalFailed = allChecks.filter(c => c.result === "failed").length;
  const totalPassed = allChecks.filter(c => c.result === "passed").length;
  const totalChecks = allChecks.length;
  const overallScore = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
  const scoreColor = overallScore >= 70 ? "#16a34a" : overallScore >= 40 ? "#d97706" : "#dc2626";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title} - Triarch</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:40px;max-width:1100px;margin:0 auto;}@media print{body{padding:20px;}.no-print{display:none;}}</style>
</head><body>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:24px;border-bottom:2px solid #111;margin-bottom:32px;">
    <div>
      <div style="font-size:28px;font-weight:900;">🛡 Triarch</div>
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
      ["Overall Score", `${overallScore}%`, scoreColor],
      ["Mapped Domains", `${domains.length}`, "#111"],
      ["Total Failed", `${totalFailed}`, "#dc2626"],
      ["Total Checks", `${totalChecks}`, "#111"],
    ].map(([label, val, color]) => `
      <div style="padding:16px 20px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e5e5;">
        <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${label}</div>
        <div style="font-size:28px;font-weight:900;color:${color};">${val}</div>
      </div>`).join("")}
  </div>
  <div style="font-size:18px;font-weight:800;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #e5e5e5;">ISO 27001 Domain Compliance Details</div>
  ${domainSections.length > 0 ? domainSections : `<div style="padding:40px;text-align:center;color:#999;">No ISO 27001 mapped checks found for the selected scope.</div>`}
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;">Triarch - Intelligent Risk-Based Patch Management & Compliance Framework · ${date}</div>
</body></html>`;
}

function buildControlPDFHtml(matchingChecks, controlId, controlTitle) {
  const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const failed = matchingChecks.filter(c => c.result === "failed");
  const passed = matchingChecks.filter(c => c.result === "passed");

  const rows = matchingChecks.map(c => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:600;">${c.assetHostname}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#666;">Check #${c.checkId}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;font-weight:700;color:${c.result === "failed" ? "#dc2626" : "#16a34a"};text-transform:uppercase;">${c.result}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Control ${controlId} Evidence - Triarch</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:40px;max-width:1100px;margin:0 auto;}@media print{body{padding:20px;}.no-print{display:none;}}</style>
</head><body>
  <div style="margin-bottom:24px;">
    <div style="font-size:22px;font-weight:900;">🛡 Triarch - ISO 27001:2022 Control ${controlId}</div>
    <div style="font-size:14px;color:#666;margin-top:4px;">${controlTitle || ""}</div>
    <div style="font-size:12px;color:#999;margin-top:8px;">Fleet-wide scan evidence · Generated ${date}</div>
  </div>
  <div class="no-print" style="margin-bottom:24px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:32px;">
    <div style="padding:16px 20px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e5e5;">
      <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;">Passing</div>
      <div style="font-size:28px;font-weight:900;color:#16a34a;">${passed.length} / ${matchingChecks.length}</div>
    </div>
    <div style="padding:16px 20px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e5e5;">
      <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;">Failing</div>
      <div style="font-size:28px;font-weight:900;color:#dc2626;">${failed.length} / ${matchingChecks.length}</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr style="background:#f8f9fa;">
      <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;">Asset</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;">Check</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;">Result</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;">Triarch - Intelligent Risk-Based Patch Management & Compliance Framework · ${date}</div>
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
    <div key={domain} className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 20px", cursor: "pointer" }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{domain}</div>
          <ScoreBar score={score} />
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: failed > 0 ? RED : NEUTRAL_TEXT }}>{failed}</div>
            <div style={{ fontSize: 10, color: NEUTRAL_MUTED, textTransform: "uppercase" }}>Failed</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: NEUTRAL_TEXT }}>{passed}</div>
            <div style={{ fontSize: 10, color: NEUTRAL_MUTED, textTransform: "uppercase" }}>Passed</div>
          </div>
          <button style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", cursor: "pointer" }}>
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>
  {open && (
  <div style={{ padding: "0 20px 16px", borderTop: "1px solid var(--line)" }}>
    <div style={{ display: "flex", gap: 6, marginTop: 12, marginBottom: 12 }}>
      {["failed", "passed"].map(r => (
        <button key={r} onClick={e => { e.stopPropagation(); setShowResult(r); }}
          style={{
            fontSize: 11, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
            background: showResult === r ? "var(--text)" : "var(--surface)",
            color: showResult === r ? "var(--panel)" : "var(--muted)",
            border: "1px solid var(--line)",
          }}>
          {r === "failed" ? `Failed (${checks.filter(c => c.result === "failed").length})` : `Passed (${checks.filter(c => c.result === "passed").length})`}
        </button>
      ))}
    </div>
    <div style={{ display: "grid", gap: 1, border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
      {checks.filter(c => c.result === showResult).map((c, i) => (
        <div key={i} style={{
          padding: "10px 14px", background: i % 2 === 0 ? "var(--panel)" : "var(--surface)",
          display: "flex", gap: 12, alignItems: "flex-start"
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: NEUTRAL_MUTED, minWidth: 44, marginTop: 1 }}>
            {c.iso27001.control}
            <button
              title={`Export fleet-wide evidence for control ${c.iso27001.control}`}
              onClick={(e) => {
                e.stopPropagation();
                const matching = checks.filter(ch => ch.iso27001.control === c.iso27001.control);
                const win = window.open("", "_blank");
                win.document.write(buildControlPDFHtml(matching, c.iso27001.control, c.title));
                win.document.close();
              }}
              style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3, cursor: "pointer", marginLeft: 4,
                background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)",
              }}
            >
              ⬇
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.title}</div>
            <div style={{ fontSize: 11.5, color: NEUTRAL_MUTED }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          ["ISO Domains Covered", byDomain.length, NEUTRAL_TEXT],
          ["Mapped Checks", allChecks.length, NEUTRAL_TEXT],
          ["Failed (mapped)", mappedFailed, mappedFailed > 0 ? RED : NEUTRAL_TEXT],
          ["Passed (mapped)", mappedPassed, NEUTRAL_TEXT],
        ].map(([label, val, color]) => (
          <div key={label} className="card" style={{ padding: "14px 16px", border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
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
  const [exportTarget, setExportTarget] = useState("all");
  const [framework, setFramework] = useState("cis");
  const [availableFrameworks, setAvailableFrameworks] = useState([]);

  useEffect(() => {
    axios.get(`${API}/api/compliance-evidence/frameworks`)
      .then((res) => setAvailableFrameworks(res.data?.data || []))
      .catch(() => setAvailableFrameworks([]));
  }, []);

  async function loadSummary() {
    try {
      setLoadingMain(true);
      setErr("");
      const res  = await axios.get(`${API}/api/dashboard/compliance/summary`);
      const data = res.data?.data || [];
      setRows(data);
      loadAllChecks(data.map(r => r.hostname), framework);
    } catch (e) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoadingMain(false);
    }
  }

  async function loadAllChecks(hostnames, forFramework) {
    setLoadingChecks(true);
    const results = {};
    await Promise.all(hostnames.map(async h => {
      try {
        const res = await axios.get(`${API}/api/compliance/checks/${encodeURIComponent(h)}`, {
          params: forFramework && forFramework !== "cis" ? { framework: forFramework } : undefined,
        });
        results[h] = res.data?.data || [];
      } catch { results[h] = []; }
    }));
    setChecksMap(results);
    setLoadingChecks(false);
  }

  useEffect(() => { loadSummary(); }, []);

  useEffect(() => {
    if (rows.length > 0) loadAllChecks(rows.map(r => r.hostname), framework);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framework]);

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

    const win = window.open("", "_blank");

    if (framework !== "cis") {
      const title = exportTarget === "all"
        ? "ISO 27001 Compliance Audit Report — All Assets"
        : `ISO 27001 Compliance Report — ${exportTarget}`;
      win.document.write(buildISOPDFHtml(exportRows, checksMap, title));
    } else {
      const title = exportTarget === "all"
        ? "CIS Compliance Audit Report — All Assets"
        : `CIS Compliance Report — ${exportTarget}`;
      win.document.write(buildPDFHtml(exportRows, checksMap, kpis, title));
    }

    win.document.close();
  }

  return (
    <Layout
      title="CIS Compliance"
      rightControls={
        <>
           <input className="input" placeholder="Search hostname..." value={q} onChange={e => setQ(e.target.value)}
             style={{ fontSize: 13 }} />
          <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
            <button onClick={() => setFramework("cis")}
              style={{
                padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                background: framework === "cis" ? "var(--text)" : "transparent",
                color: framework === "cis" ? "var(--panel)" : "var(--muted)",
              }}>
              CIS Benchmark
            </button>
            {availableFrameworks.map((f) => (
              <button key={f.id} onClick={() => setFramework(f.id)}
                style={{
                  padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                  background: framework === f.id ? "var(--text)" : "transparent",
                  color: framework === f.id ? "var(--panel)" : "var(--muted)",
                }}>
                {f.label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={loadSummary} style={{ fontSize: 12 }}>Refresh</button>
          <select className="input" value={exportTarget} onChange={e => setExportTarget(e.target.value)} style={{ minWidth: 150, fontSize: 13 }}>
            <option value="all">All Assets</option>
            {rows.map(r => <option key={r.hostname} value={r.hostname}>{r.hostname}</option>)}
          </select>
          <button className="btn" onClick={handleExport} style={{ fontSize: 12 }}>Export PDF</button>
        </>
      }
    >
      {err && <div style={{ color: RED, marginBottom: 16, fontSize: 13 }}>{err}</div>}
      {kpis && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <div className="card" style={{ padding: "14px 16px", border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Fleet Avg Score</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: kpis.avgScore >= 70 ? RED : NEUTRAL_TEXT }}>{kpis.avgScore}%</div>
          </div>
          <div className="card" style={{ padding: "14px 16px", border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Non-Compliant Assets</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: kpis.nonCompliant > 0 ? RED : NEUTRAL_TEXT }}>{kpis.nonCompliant} / {rows.length}</div>
          </div>
          <div className="card" style={{ padding: "14px 16px", border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Total Failed Checks</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: kpis.totalFailed > 0 ? RED : NEUTRAL_TEXT }}>{kpis.totalFailed}</div>
          </div>
          <div className="card" style={{ padding: "14px 16px", border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Total Checks Evaluated</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: NEUTRAL_TEXT }}>{kpis.totalChecks}</div>
            {kpis.totalChecks > 0 && <div style={{ fontSize: 11, color: NEUTRAL_MUTED, marginTop: 4 }}>{kpis.totalPassed} passed · {kpis.totalFailed} failed</div>}
          </div>
        </div>
      )}
      {loadingMain && <div className="muted">Loading compliance data...</div>}
      {!loadingMain && (
        <div style={{ display: "grid", gap: 10 }}>
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
