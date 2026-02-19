import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function riskBadge(priority, score) {
  const p = (priority || "Low").toLowerCase();
  const cls = p === "critical" ? "critical" : p === "high" ? "high" : p === "medium" ? "medium" : "low";
  return (
    <span className={`badge ${cls}`}>
      <span className="badgeDot"></span>
      {priority || "Low"} ({score ?? "-"})
    </span>
  );
}

function statusBadge(status) {
  // Wazuh agent status is usually "active" when online
  if (status === "active") {
    return (
      <span className="badge online">
        <span className="badgeDot"></span>
        Online
      </span>
    );
  }
  if (status) {
    return (
      <span className="badge offline">
        <span className="badgeDot"></span>
        Offline
      </span>
    );
  }
  return (
    <span className="badge unknown">
      <span className="badgeDot"></span>
      Unknown
    </span>
  );
}

export default function Assets() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const res = await axios.get(`${API}/api/assets/overview`);
      setRows(res.data?.data || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      (r.hostname || "").toLowerCase().includes(qq) ||
      (r.os || "").toLowerCase().includes(qq) ||
      (r.ip || "").toLowerCase().includes(qq)
    );
  }, [rows, q]);

  return (
    <Layout
      title="Assets"
      rightControls={
        <input
          className="input"
          placeholder="Search hostname / IP..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      }
    >
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>Status</th>
              <th>OS</th>
              <th>IP</th>
              <th>Risk</th>
              <th>Missing</th>
              <th>Compliance failed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const agentStatus = r?.compliance?.raw?.agent?.status; // "active" when online
              const priority = r?.risk?.priority || "Low";
              const score = r?.risk?.score ?? 0;

              return (
                <tr key={r.hostname}>
                  <td>
                    <Link to={`/asset/${encodeURIComponent(r.hostname)}`}>{r.hostname}</Link>
                  </td>
                  <td>{statusBadge(agentStatus)}</td>
                  <td>{r.os}</td>
                  <td>{r.ip || "-"}</td>
                  <td>{riskBadge(priority, score)}</td>
                  <td>{r?.patch?.missingCount ?? "-"}</td>
                  <td>{r?.compliance?.failedCount ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
