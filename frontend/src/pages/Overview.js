import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function priorityRank(p) {
  const map = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  return map[p] || 0;
}

function badgeClass(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "critical") return "badge critical";
  if (p === "high") return "badge high";
  if (p === "medium") return "badge medium";
  return "badge low";
}

function exportCSV(rows) {
  const header = ["hostname","os","ip","missingCount","failedCount","riskScore","priority","lastSeen"];
  const lines = [header.join(",")];

  for (const r of rows) {
    const line = [
      r.hostname,
      r.os,
      r.ip || "",
      r.patch?.missingCount ?? "",
      r.compliance?.failedCount ?? "",
      r.risk?.score ?? "",
      r.risk?.priority ?? "",
      r.lastSeen || ""
    ].map(v => `"${String(v).replaceAll('"','""')}"`).join(",");
    lines.push(line);
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "riskpatch_overview.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Overview() {
  const [rows, setRows] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/assets/overview`);
      setRows(res.data?.data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    const base = rows.filter(r => {
      const matchesPriority = priorityFilter === "All"
        ? true
        : (r?.risk?.priority === priorityFilter);

      const matchesSearch = !qq
        ? true
        : (
          (r.hostname || "").toLowerCase().includes(qq) ||
          (r.os || "").toLowerCase().includes(qq) ||
          (r.ip || "").toLowerCase().includes(qq)
        );

      return matchesPriority && matchesSearch;
    });

    return [...base].sort((a, b) => {
      const pr = priorityRank(b?.risk?.priority) - priorityRank(a?.risk?.priority);
      if (pr !== 0) return pr;
      return (b?.risk?.score || 0) - (a?.risk?.score || 0);
    });
  }, [rows, priorityFilter, q]);

  // KPIs
  const kpis = useMemo(() => {
    const total = rows.length;
    const high = rows.filter(r => ["High","Critical"].includes(r?.risk?.priority)).length;
    const nonCompliant = rows.filter(r => (r?.compliance?.failedCount || 0) > 0).length;

    // Overdue definition: patchCollectedAt older than 7 days
    const overdue = rows.filter(r => {
      const t = r?.patch?.collectedAt;
      if (!t) return true; // no data => overdue
      const ageMs = Date.now() - new Date(t).getTime();
      return ageMs > (7 * 24 * 60 * 60 * 1000);
    }).length;

    return { total, high, nonCompliant, overdue };
  }, [rows]);

  return (
    <Layout
      title="Assets Overview"
      rightControls={
        <>
          <input className="input" placeholder="Search hostname / OS / IP..." value={q} onChange={(e)=>setQ(e.target.value)} />
          <select className="input" style={{ minWidth: 150 }} value={priorityFilter} onChange={(e)=>setPriorityFilter(e.target.value)}>
            <option>All</option>
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <button className="button" onClick={load}>Refresh</button>
          <button className="button" onClick={() => exportCSV(filtered)}>Export CSV</button>
          <button className="button" onClick={() => window.print()}>Export PDF</button>
        </>
      }
    >
      <div className="kpis">
        <div className="card"><div className="cardLabel">Total assets</div><div className="cardValue">{kpis.total}</div></div>
        <div className="card"><div className="cardLabel">High/Critical</div><div className="cardValue">{kpis.high}</div></div>
        <div className="card"><div className="cardLabel">Non-compliant</div><div className="cardValue">{kpis.nonCompliant}</div></div>
        <div className="card"><div className="cardLabel">Overdue patch data</div><div className="cardValue">{kpis.overdue}</div></div>
      </div>

      {loading && <div className="muted">Loading...</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      {!loading && !err && (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Hostname</th>
                <th>OS</th>
                <th>IP</th>
                <th>Missing</th>
                <th>Compliance failed</th>
                <th>Risk</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.hostname}>
                  <td>
                    <Link to={`/asset/${encodeURIComponent(r.hostname)}`}>{r.hostname}</Link>
                  </td>
                  <td>{r.os}</td>
                  <td>{r.ip || "-"}</td>
                  <td>{r.patch?.missingCount ?? "-"}</td>
                  <td>{r.compliance?.failedCount ?? "-"}</td>
                  <td>
                    <span className={badgeClass(r?.risk?.priority)}>
                      {r?.risk?.priority ?? "-"} ({r?.risk?.score ?? "-"})
                    </span>
                  </td>
                  <td className="muted">
                    {r.lastSeen ? new Date(r.lastSeen).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
