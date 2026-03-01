import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function normalizeMissingItem(x) {
  if (x == null) return "";
  return String(x).trim();
}

function toLocal(ts) {
  if (!ts) return "-";
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

function rankPriority(p) {
  return { Critical: 4, High: 3, Medium: 2, Low: 1 }[p] || 0;
}

function exportGroupedCSV(filtered) {
  const header = ["hostname", "os", "riskPriority", "riskScore", "missingCount", "collectedAt", "missingItems"];
  const lines  = [header.join(",")];
  for (const g of filtered) {
    const line = [g.hostname, g.os, g.riskPriority, g.riskScore ?? "", g.missingCount, g.latestCollectedAt || "", g.missingList.join(" | ")]
      .map(v => `"${String(v).replaceAll('"', '""')}"`).join(",");
    lines.push(line);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "riskpatch_backlog_grouped.csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(filtered) {
  const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const totalMissing = filtered.reduce((s, g) => s + g.missingCount, 0);
  const priorityColor = p => ({ Critical: "#dc2626", High: "#ea580c", Medium: "#d97706", Low: "#16a34a" }[p] || "#666");

  const assetSections = filtered.map(g => {
    const pc = priorityColor(g.riskPriority);
    const patchRows = g.missingList.map((item, i) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#fafafa"};">
        <td style="padding:7px 12px;font-size:12px;font-family:monospace;border-bottom:1px solid #f0f0f0;">${item}</td>
      </tr>`).join("");

    return `
      <div style="margin-bottom:36px;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#f8f9fa;border-radius:8px;margin-bottom:12px;border-left:4px solid ${pc};">
          <div>
            <div style="font-size:17px;font-weight:800;">${g.hostname}</div>
            <div style="font-size:12px;color:#666;margin-top:3px;">
              ${g.os.toUpperCase()} · Last collected: ${toLocal(g.latestCollectedAt)}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:24px;font-weight:900;color:${pc};">${g.missingCount}</div>
            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;background:${pc}22;color:${pc};border:1px solid ${pc}44;">${g.riskPriority} (${g.riskScore ?? "-"})</span>
          </div>
        </div>
        ${g.missingCount === 0
          ? `<div style="padding:12px;color:#16a34a;font-size:13px;">✓ No missing patches for this asset.</div>`
          : `<table style="width:100%;border-collapse:collapse;">
              <thead><tr style="background:#f0f0f0;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">Missing Patch / Package</th>
              </tr></thead>
              <tbody>${patchRows}</tbody>
             </table>`
        }
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Patch Backlog Report — RiskPatch</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:40px;max-width:1100px;margin:0 auto;}@media print{body{padding:20px;}.no-print{display:none;}}</style>
</head><body>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:24px;border-bottom:2px solid #111;margin-bottom:32px;">
    <div>
      <div style="font-size:28px;font-weight:900;">🛡 RiskPatch</div>
      <div style="font-size:14px;color:#666;margin-top:4px;">Patch Backlog Report</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:13px;color:#666;">Generated: ${date}</div>
      <div style="font-size:13px;color:#666;margin-top:4px;">Assets: ${filtered.length}</div>
    </div>
  </div>
  <div class="no-print" style="margin-bottom:24px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px;">
    ${[
      ["Assets in Backlog", filtered.length, "#111"],
      ["Total Missing Patches", totalMissing, totalMissing > 0 ? "#dc2626" : "#16a34a"],
      ["Critical / High Risk", filtered.filter(g => ["Critical","High"].includes(g.riskPriority)).length, "#dc2626"],
    ].map(([label, val, color]) => `
      <div style="padding:16px 20px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e5e5;">
        <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${label}</div>
        <div style="font-size:28px;font-weight:900;color:${color};">${val}</div>
      </div>`).join("")}
  </div>
  <div style="font-size:18px;font-weight:800;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #e5e5e5;">Per-Asset Patch Backlog</div>
  ${assetSections}
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;">RiskPatch — Intelligent Risk-Based Patch Management & Compliance Framework · ${date}</div>
</body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
}

export default function Backlog() {
  const [rows, setRows]               = useState([]);
  const [overviewRows, setOverviewRows] = useState([]);
  const [err, setErr]                 = useState("");
  const [q, setQ]                     = useState("");
  const [osFilter, setOsFilter]       = useState("All");
  const [riskFilter, setRiskFilter]   = useState("All");
  const [expanded, setExpanded]       = useState(() => new Set());

  async function load() {
    try {
      setErr("");
      const [backlogRes, overviewRes] = await Promise.all([
        axios.get(`${API}/api/dashboard/patches/backlog`),
        axios.get(`${API}/api/assets/overview`),
      ]);
      setRows(backlogRes.data?.data || []);
      setOverviewRows(overviewRes.data?.data || []);
    } catch (e) { setErr(e?.message || "Failed to load"); }
  }

  useEffect(() => { load(); }, []);

  const riskByHost = useMemo(() => {
    const map = new Map();
    for (const r of overviewRows) map.set(r.hostname, { score: r?.risk?.score ?? null, priority: r?.risk?.priority ?? "Low" });
    return map;
  }, [overviewRows]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const hostname    = r.hostname || "unknown";
      const os          = (r.os || "-").toLowerCase();
      const collectedAt = r.collectedAt || null;
      const missingItem = normalizeMissingItem(r.missingItem);
      if (!map.has(hostname)) {
        const risk = riskByHost.get(hostname) || { score: null, priority: "Low" };
        map.set(hostname, { hostname, os, latestCollectedAt: collectedAt, missingItems: new Set(), riskPriority: risk.priority, riskScore: risk.score });
      }
      const g = map.get(hostname);
      if ((g.os === "-" || !g.os) && os) g.os = os;
      if (collectedAt) {
        const cur = g.latestCollectedAt ? new Date(g.latestCollectedAt).getTime() : 0;
        const nxt = new Date(collectedAt).getTime();
        if (nxt > cur) g.latestCollectedAt = collectedAt;
      }
      if (missingItem) g.missingItems.add(missingItem);
    }
    return Array.from(map.values()).map(g => ({
      ...g, missingCount: g.missingItems.size, missingList: Array.from(g.missingItems).sort((a, b) => a.localeCompare(b)),
    })).sort((a, b) => {
      const pr = rankPriority(b.riskPriority) - rankPriority(a.riskPriority);
      if (pr !== 0) return pr;
      if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount;
      return (a.hostname || "").localeCompare(b.hostname || "");
    });
  }, [rows, riskByHost]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return grouped.filter(g => {
      const ms = !qq || (g.hostname || "").toLowerCase().includes(qq);
      const mo = osFilter === "All" || (g.os || "").toLowerCase() === osFilter.toLowerCase();
      const mr = riskFilter === "All" || g.riskPriority === riskFilter;
      return ms && mo && mr;
    });
  }, [grouped, q, osFilter, riskFilter]);

  function toggle(hostname) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(hostname) ? next.delete(hostname) : next.add(hostname);
      return next;
    });
  }

  return (
    <Layout
      title="Patch Backlog"
      rightControls={
        <>
          <input className="input" placeholder="Search hostname..." value={q} onChange={e => setQ(e.target.value)} />
          <select className="input" style={{ minWidth: 150 }} value={osFilter} onChange={e => setOsFilter(e.target.value)}>
            <option value="All">All OS</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
          <select className="input" style={{ minWidth: 160 }} value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
            <option value="All">All Risk</option>
            <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
          <button className="btn" onClick={load}>Refresh</button>
          <button className="btn" onClick={() => exportGroupedCSV(filtered)}>Export CSV</button>
          <button className="btn" onClick={() => exportPDF(filtered)}>Export PDF</button>
        </>
      }
    >
      {err && <div style={{ color: "crimson", marginBottom: 10 }}>{err}</div>}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}></th>
              <th>Hostname</th><th>OS</th><th>Risk</th><th>Missing</th><th>Collected At</th><th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(g => {
              const isOpen  = expanded.has(g.hostname);
              const preview = g.missingList.slice(0, 3).join(", ");
              const more    = g.missingCount > 3 ? ` (+${g.missingCount - 3} more)` : "";
              return (
                <>
                  <tr key={g.hostname}>
                    <td>
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => toggle(g.hostname)}>
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>
                    <td>{g.hostname}</td>
                    <td>{(g.os || "-").toUpperCase()}</td>
                    <td>
                      <span className={`badge ${(g.riskPriority || "Low").toLowerCase()}`}>
                        {g.riskPriority}{typeof g.riskScore === "number" ? ` (${g.riskScore})` : ""}
                      </span>
                    </td>
                    <td>{g.missingCount}</td>
                    <td className="muted">{toLocal(g.latestCollectedAt)}</td>
                    <td className="muted">{g.missingCount === 0 ? "-" : `${preview}${more}`}</td>
                  </tr>
                  {isOpen && (
                    <tr key={`${g.hostname}-details`}>
                      <td></td>
                      <td colSpan={6}>
                        <div style={{ padding: "10px 0" }}>
                          <div className="muted" style={{ marginBottom: 8 }}>Missing items ({g.missingCount})</div>
                          {g.missingCount === 0
                            ? <div className="muted">No missing patches/packages.</div>
                            : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
                                {g.missingList.map(item => (
                                  <div key={`${g.hostname}-${item}`} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--card)" }}>
                                    <div style={{ fontSize: 13 }}>{item}</div>
                                  </div>
                                ))}
                              </div>
                          }
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