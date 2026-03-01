import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function priorityRank(p) {
  return { Critical: 4, High: 3, Medium: 2, Low: 1 }[p] || 0;
}

function badgeClass(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "critical") return "badge critical";
  if (p === "high")     return "badge high";
  if (p === "medium")   return "badge medium";
  return "badge low";
}

function exportCSV(rows) {
  const header = ["hostname", "os", "ip", "missingCount", "failedCount", "riskScore", "priority", "lastSeen"];
  const lines  = [header.join(",")];
  for (const r of rows) {
    const line = [
      r.hostname, r.os, r.ip || "",
      r.patch?.missingCount ?? "",
      r.compliance?.failedCount ?? "",
      r.risk?.score ?? "",
      r.risk?.priority ?? "",
      r.lastSeen || "",
    ].map(v => `"${String(v).replaceAll('"', '""')}"`).join(",");
    lines.push(line);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "riskpatch_overview.csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(rows) {
  const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  const critical = rows.filter(r => r?.risk?.priority === "Critical").length;
  const high     = rows.filter(r => r?.risk?.priority === "High").length;
  const nonComp  = rows.filter(r => (r?.compliance?.failedCount || 0) > 0).length;
  const avgScore = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r?.risk?.score || 0), 0) / rows.length)
    : 0;

  const priorityColor = p => ({ Critical: "#dc2626", High: "#ea580c", Medium: "#d97706", Low: "#16a34a" }[p] || "#666");

  const tableRows = rows.map(r => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:10px 12px;font-weight:700;font-size:13px;">${r.hostname}</td>
      <td style="padding:10px 12px;font-size:12px;color:#666;">${r.os || "-"}</td>
      <td style="padding:10px 12px;font-size:12px;">${r.ip || "-"}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:700;">${r.patch?.missingCount ?? 0}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:700;color:${(r.compliance?.failedCount || 0) > 0 ? "#dc2626" : "#16a34a"};">${r.compliance?.failedCount ?? 0}</td>
      <td style="padding:10px 12px;">
        <span style="padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;background:${priorityColor(r?.risk?.priority)}22;color:${priorityColor(r?.risk?.priority)};border:1px solid ${priorityColor(r?.risk?.priority)}44;">
          ${r?.risk?.priority || "Low"} (${r?.risk?.score ?? 0})
        </span>
      </td>
      <td style="padding:10px 12px;font-size:11px;color:#999;">${r.lastSeen ? new Date(r.lastSeen).toLocaleString() : "-"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Security Overview Report — RiskPatch</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:40px;max-width:1200px;margin:0 auto;}@media print{body{padding:20px;}.no-print{display:none;}}</style>
</head><body>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:24px;border-bottom:2px solid #111;margin-bottom:32px;">
    <div>
      <div style="font-size:28px;font-weight:900;">🛡 RiskPatch</div>
      <div style="font-size:14px;color:#666;margin-top:4px;">Security Overview Report</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:13px;color:#666;">Generated: ${date}</div>
      <div style="font-size:13px;color:#666;margin-top:4px;">Assets: ${rows.length}</div>
    </div>
  </div>
  <div class="no-print" style="margin-bottom:24px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;">
    ${[
      ["Total Assets", rows.length, "#111"],
      ["Critical / High", `${critical} / ${high}`, critical > 0 ? "#dc2626" : "#111"],
      ["Non-Compliant", nonComp, nonComp > 0 ? "#dc2626" : "#16a34a"],
      ["Avg Risk Score", avgScore, avgScore >= 75 ? "#dc2626" : avgScore >= 50 ? "#d97706" : "#16a34a"],
    ].map(([label, val, color]) => `
      <div style="padding:16px 20px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e5e5;">
        <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${label}</div>
        <div style="font-size:28px;font-weight:900;color:${color};">${val}</div>
      </div>`).join("")}
  </div>
  <div style="font-size:18px;font-weight:800;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e5e5;">Asset Risk Summary</div>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f0f0f0;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">Hostname</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">OS</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">IP</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">Missing Patches</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">CIS Failures</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">Risk Level</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;">Last Seen</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;">RiskPatch — Intelligent Risk-Based Patch Management & Compliance Framework · ${date}</div>
</body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
}

function FleetHealth({ rows }) {
  const healthyCount = useMemo(() =>
    rows.filter(r => (r?.risk?.score || 0) < 20 && (r?.compliance?.failedCount || 0) === 0).length,
  [rows]);
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
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 900 }}>{pct}%</div>
        </div>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700 }}>{healthyCount} of {rows.length} assets</div>
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
  const recentAssets = useMemo(() =>
    [...rows].filter(r => r.lastSeen).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)).slice(0, 5),
  [rows]);
  return (
    <div className="card" style={{ flex: 1, padding: "20px" }}>
      <div className="cardLabel" style={{ marginBottom: 16 }}>Recent Activity</div>
      <div style={{ display: "grid", gap: 14 }}>
        {recentAssets.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", paddingBottom: 10, borderBottom: i === recentAssets.length - 1 ? "none" : "1px solid var(--line)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>{r.hostname} checked in</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: 2 }}>{new Date(r.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <Link to={`/asset/${encodeURIComponent(r.hostname)}`} className="btn" style={{ padding: "4px 8px", fontSize: "10px" }}>View</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const [rows, setRows]           = useState([]);
  const [priorityFilter, setPF]   = useState("All");
  const [q, setQ]                 = useState("");
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState("");

  async function load() {
    try {
      setLoading(true); setErr("");
      const res = await axios.get(`${API}/api/assets/overview`);
      setRows(res.data?.data || []);
    } catch (e) { setErr(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return [...rows.filter(r => {
      const mp = priorityFilter === "All" || r?.risk?.priority === priorityFilter;
      const ms = !qq || (r.hostname||"").toLowerCase().includes(qq) || (r.os||"").toLowerCase().includes(qq) || (r.ip||"").toLowerCase().includes(qq);
      return mp && ms;
    })].sort((a, b) => {
      const pr = priorityRank(b?.risk?.priority) - priorityRank(a?.risk?.priority);
      return pr !== 0 ? pr : (b?.risk?.score || 0) - (a?.risk?.score || 0);
    });
  }, [rows, priorityFilter, q]);

  const kpis = useMemo(() => {
    const total        = rows.length;
    const high         = rows.filter(r => ["High", "Critical"].includes(r?.risk?.priority)).length;
    const nonCompliant = rows.filter(r => (r?.compliance?.failedCount || 0) > 0).length;
    const overdue      = rows.filter(r => {
      const t = r?.patch?.collectedAt;
      return !t || Date.now() - new Date(t).getTime() > 7 * 24 * 60 * 60 * 1000;
    }).length;
    return { total, high, nonCompliant, overdue };
  }, [rows]);

  return (
    <Layout
      title="Security Dashboard"
      rightControls={
        <>
          <input className="input" placeholder="Search fleet..." value={q} onChange={e => setQ(e.target.value)} />
          <select className="input" style={{ minWidth: 140 }} value={priorityFilter} onChange={e => setPF(e.target.value)}>
            <option value="All">All Priorities</option>
            <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
          <button className="btn" onClick={load}>Refresh</button>
          <button className="btn" onClick={() => exportCSV(filtered)}>Export CSV</button>
          <button className="btn" onClick={() => exportPDF(filtered)}>Export PDF</button>
        </>
      }
    >
      <div className="kpis">
        <div className="card"><div className="cardLabel">Protected Assets</div><div className="cardValue">{kpis.total}</div></div>
        <div className="card"><div className="cardLabel">High/Critical Risk</div><div className="cardValue" style={{ color: kpis.high > 0 ? "hsl(350,100%,65%)" : "inherit" }}>{kpis.high}</div></div>
        <div className="card"><div className="cardLabel">Non-Compliant</div><div className="cardValue" style={{ color: kpis.nonCompliant > 0 ? "hsl(25,100%,60%)" : "inherit" }}>{kpis.nonCompliant}</div></div>
        <div className="card"><div className="cardLabel">Patch Overdue</div><div className="cardValue" style={{ color: kpis.overdue > 0 ? "hsl(45,100%,50%)" : "inherit" }}>{kpis.overdue}</div></div>
      </div>
      <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
        <FleetHealth rows={rows} />
        <ActivityFeed rows={rows} />
      </div>
      {loading && <div className="muted">Loading analytics...</div>}
      {err     && <div style={{ color: "crimson" }}>{err}</div>}
      {!loading && !err && (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Hostname</th><th>Operating System</th><th>Patch Risk</th>
                <th>SCA Failed</th><th>Security Score</th><th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.hostname}>
                  <td>
                    <Link to={`/asset/${encodeURIComponent(r.hostname)}`} style={{ fontWeight: 600 }}>{r.hostname}</Link>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: 2 }}>{r.ip || "No IP"}</div>
                  </td>
                  <td style={{ fontSize: "13px" }}>{r.os}</td>
                  <td>{r.patch?.missingCount ?? "0"} updates</td>
                  <td style={{ fontWeight: 700, color: r.compliance?.failedCount > 0 ? "hsl(350,100%,65%)" : "inherit" }}>{r.compliance?.failedCount ?? "0"}</td>
                  <td><span className={badgeClass(r?.risk?.priority)}>{r?.risk?.priority ?? "-"} ({r?.risk?.score ?? "0"})</span></td>
                  <td className="muted" style={{ fontSize: "12px" }}>{r.lastSeen ? new Date(r.lastSeen).toLocaleTimeString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}