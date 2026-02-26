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

function FleetAnalytics({ rows }) {
  const stats = useMemo(() => {
    const risk = { critical: 0, high: 0, medium: 0, low: 0 };
    const os = {};
    rows.forEach(r => {
      const p = (r?.risk?.priority || "Low").toLowerCase();
      if (risk[p] !== undefined) risk[p]++;

      const osSimple = (r.os || "Unknown").split(' ')[0] || "Unknown";
      os[osSimple] = (os[osSimple] || 0) + 1;
    });
    return { risk, os };
  }, [rows]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginTop: 32 }}>
      {/* Risk Distribution Chart */}
      <div className="card">
        <div className="cardLabel">Fleet Risk Distribution</div>
        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          {['critical', 'high', 'medium', 'low'].map(key => {
            const count = stats.risk[key];
            const pct = rows.length ? (count / rows.length) * 100 : 0;
            const color = key === 'critical' ? 'hsl(350, 100%, 65%)' : key === 'high' ? 'hsl(25, 100%, 60%)' : key === 'medium' ? 'hsl(45, 100%, 50%)' : 'hsl(150, 100%, 45%)';
            return (
              <div key={key} style={{ display: "grid", gridTemplateColumns: "80px 1fr 40px", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "capitalize", color: "var(--muted)" }}>{key}</div>
                <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 1s ease-out" }}></div>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 800, textAlign: "right" }}>{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* OS Breakdown Chart */}
      <div className="card" style={{ display: "flex", flexDirection: "column" }}>
        <div className="cardLabel">OS & Environment Breakdown</div>
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 20, flex: 1 }}>
          <div style={{ position: "relative", width: 120, height: 120 }}>
            <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
              {(() => {
                let offset = 0;
                return Object.entries(stats.os).map(([name, count], i) => {
                  const pct = (count / rows.length) * 100;
                  const stroke = (pct * 100) / 100;
                  const dash = `${stroke} ${100 - stroke}`;
                  const currentOffset = offset;
                  offset += stroke;
                  const colors = ['var(--accent)', 'hsl(280, 80%, 70%)', 'hsl(180, 80%, 50%)', 'hsl(30, 80%, 60%)'];
                  return (
                    <circle
                      key={name}
                      cx="18" cy="18" r="15.9"
                      fill="transparent"
                      stroke={colors[i % colors.length]}
                      strokeWidth="3"
                      strokeDasharray={dash}
                      strokeDashoffset={-currentOffset}
                    />
                  );
                });
              })()}
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", background: "var(--panel)", borderRadius: "50%", margin: "15%", backdropFilter: "blur(4px)", border: "1px solid var(--panel-border)" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted)" }}>TOTAL</div>
              <div style={{ fontSize: "16px", fontWeight: 900 }}>{rows.length}</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(stats.os).map(([name, count], i) => {
              const colors = ['var(--accent)', 'hsl(280, 80%, 70%)', 'hsl(180, 80%, 50%)', 'hsl(30, 80%, 60%)'];
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[i % colors.length] }}></div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: "11px", color: "var(--muted)" }}>({count})</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
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
      title="Fleet Assets"
      rightControls={
        <input
          className="input"
          placeholder="Search hostname / IP..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 300 }}
        />
      }
    >
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>Status</th>
              <th>Operating System</th>
              <th>IP Address</th>
              <th>Risk Level</th>
              <th>Patches</th>
              <th>CIS Failures</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const agentStatus = r?.compliance?.raw?.agent?.status;
              const priority = r?.risk?.priority || "Low";
              const score = r?.risk?.score ?? 0;

              return (
                <tr key={r.hostname}>
                  <td>
                    <Link to={`/asset/${encodeURIComponent(r.hostname)}`} style={{ fontWeight: 600 }}>{r.hostname}</Link>
                  </td>
                  <td>{statusBadge(agentStatus)}</td>
                  <td style={{ fontSize: "13px", color: "var(--muted)" }}>{r.os}</td>
                  <td className="mono" style={{ fontSize: "12px" }}>{r.ip || "-"}</td>
                  <td>{riskBadge(priority, score)}</td>
                  <td style={{ fontWeight: 700 }}>{r?.patch?.missingCount ?? "0"}</td>
                  <td style={{ fontWeight: 700, color: (r?.compliance?.failedCount > 0 ? "hsl(350, 100%, 65%)" : "inherit") }}>
                    {r?.compliance?.failedCount ?? "0"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FleetAnalytics rows={filtered} />
    </Layout>
  );
}
