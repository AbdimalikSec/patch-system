import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const STATUS_COLOR = {
  success: { bg: "hsla(130,60%,50%,0.15)", border: "hsl(130,60%,50%)", text: "hsl(130,60%,50%)" },
  failed:  { bg: "hsla(350,100%,65%,0.15)", border: "hsl(350,100%,65%)", text: "hsl(350,100%,65%)" },
  running: { bg: "hsla(45,100%,50%,0.15)", border: "hsl(45,100%,50%)", text: "hsl(45,100%,50%)" },
  pending: { bg: "hsla(210,15%,60%,0.15)", border: "hsl(210,15%,60%)", text: "hsl(210,15%,60%)" },
};

export default function PatchLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [hostnameFilter, setHostnameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState(null);

  async function loadLogs() {
    try {
      setLoading(true);
      setErr("");
      const params = {};
      if (hostnameFilter.trim()) params.hostname = hostnameFilter.trim();
      if (statusFilter) params.status = statusFilter;
      const res = await axios.get(`${API}/api/agent/history`, { params });
      setLogs(res.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load patch history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e) {
    e.preventDefault();
    loadLogs();
  }

  function exportCSV() {
    const header = ["Hostname", "Package/KB", "Type", "Status", "Created At", "Completed At", "Output"];
    const rows = logs.map((l) => [
      l.hostname,
      l.kb,
      l.type || "patch",
      l.status,
      new Date(l.createdAt).toISOString(),
      l.completedAt ? new Date(l.completedAt).toISOString() : "",
      (l.output || "").replace(/\n/g, " ").replace(/"/g, "'"),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patch-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <Layout
      title="Patch Log"
      rightControls={
        <button className="btn" onClick={exportCSV} style={{ fontSize: 12, padding: "6px 14px" }}>
          Export CSV
        </button>
      }
    >
      {err && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 20,
            background: "hsla(350,100%,65%,0.1)",
            border: "1px solid hsla(350,100%,65%,0.3)",
            color: "hsl(350,100%,65%)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <form
          onSubmit={handleFilter}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}
        >
          <div>
            <div style={labelStyle}>Hostname</div>
            <input
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="e.g. DC1 (blank = all)"
              value={hostnameFilter}
              onChange={(e) => setHostnameFilter(e.target.value)}
            />
          </div>
          <div>
            <div style={labelStyle}>Status</div>
            <select
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <button className="btn" type="submit" style={{ padding: "10px 20px" }}>
            Filter
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15 }}>Patch History</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {logs.length} record{logs.length !== 1 ? "s" : ""}
          </div>
        </div>

        {loading && (
          <div className="muted" style={{ padding: 24 }}>
            Loading patch history...
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>
            No patch records found.
          </div>
        )}

        {!loading && logs.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Hostname", "Package/KB", "Type", "Status", "Created", "Completed", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => {
                const sc = STATUS_COLOR[l.status] || STATUS_COLOR.pending;
                const isOpen = expanded === l._id;
                return (
                  <>
                    <tr
                      key={l._id}
                      onClick={() => setExpanded(isOpen ? null : l._id)}
                      style={{
                        borderBottom: isOpen ? "none" : (i < logs.length - 1 ? "1px solid var(--line)" : "none"),
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "14px 24px", fontWeight: 700, fontSize: 13 }}>
                        {l.hostname}
                      </td>
                      <td style={{ padding: "14px 24px", fontSize: 13 }}>{l.kb}</td>
                      <td style={{ padding: "14px 24px", fontSize: 13, textTransform: "capitalize" }}>
                        {l.type || "patch"}
                      </td>
                      <td style={{ padding: "14px 24px" }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: 4,
                            background: sc.bg,
                            border: `1px solid ${sc.border}`,
                            color: sc.text,
                            textTransform: "uppercase",
                          }}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 24px", fontSize: 12, color: "var(--muted)" }}>
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "14px 24px", fontSize: 12, color: "var(--muted)" }}>
                        {l.completedAt ? new Date(l.completedAt).toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "14px 24px", fontSize: 12, color: "var(--muted)" }}>
                        {isOpen ? "▲" : "▼"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ borderBottom: i < logs.length - 1 ? "1px solid var(--line)" : "none" }}>
                        <td colSpan={7} style={{ padding: "0 24px 18px 24px" }}>
                          <pre
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--line)",
                              borderRadius: 8,
                              padding: 14,
                              fontSize: 11,
                              lineHeight: 1.5,
                              overflow: "auto",
                              maxHeight: 260,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              margin: 0,
                            }}
                          >
                            {l.output || "(no output captured)"}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
