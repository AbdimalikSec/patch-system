import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

export default function Compliance() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const res = await axios.get(`${API}/api/dashboard/compliance/summary`);
        setRows(res.data?.data || []);
      } catch (e) {
        setErr(e?.message || "Failed to load");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter(r => (r.hostname || "").toLowerCase().includes(qq));
  }, [rows, q]);

  return (
    <Layout
      title="Compliance"
      rightControls={
        <>
          <input className="input" placeholder="Search hostname..." value={q} onChange={(e)=>setQ(e.target.value)} />
          <button className="button" onClick={() => window.print()}>Export PDF</button>
        </>
      }
    >
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>Status</th>
              <th>Score</th>
              <th>Failed Count</th>
              <th>Collected At</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.hostname}>
                <td>{r.hostname}</td>
                <td>{r.status}</td>
                <td>{r.score ?? "-"}</td>
                <td>{r.failedCount ?? "-"}</td>
                <td className="muted">{r.collectedAt ? new Date(r.collectedAt).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
