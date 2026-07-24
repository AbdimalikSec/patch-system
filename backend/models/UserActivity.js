import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function ActionBadge({ action, success }) {
  let label = action;
  let color = { bg: "hsla(210,15%,60%,0.15)", border: "hsl(210,15%,60%)", text: "hsl(210,15%,60%)" };

  if (action === "login_success") {
    label = "Login Success";
    color = { bg: "hsla(130,60%,50%,0.15)", border: "hsl(130,60%,50%)", text: "hsl(130,60%,50%)" };
  } else if (action === "login_failed") {
    label = "Login Failed";
    color = { bg: "hsla(350,100%,65%,0.15)", border: "hsl(350,100%,65%)", text: "hsl(350,100%,65%)" };
  } else if (!success) {
    color = { bg: "hsla(25,100%,60%,0.15)", border: "hsl(25,100%,60%)", text: "hsl(25,100%,60%)" };
  } else {
    color = { bg: "hsla(210,100%,60%,0.15)", border: "hsl(210,100%,60%)", text: "hsl(210,100%,60%)" };
  }

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 4,
        background: color.bg,
        border: `1px solid ${color.border}`,
        color: color.text,
      }}
    >
      {label}
    </span>
  );
}

export default function UserActivity() {
  const [summary, setSummary] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [usernameFilter, setUsernameFilter] = useState("");
  const [actionFilter, setActionFilter] = useState(""); // "" | "logins" | "actions"

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const [summaryRes, listRes] = await Promise.all([
        axios.get(`${API}/api/user-activity/summary`),
        axios.get(`${API}/api/user-activity`, {
          params: {
            username: usernameFilter || undefined,
            action: actionFilter || undefined,
          },
        }),
      ]);
      setSummary(summaryRes.data?.data || []);
      setRecords(listRes.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load user activity");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(e) {
    e.preventDefault();
    load();
  }

  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
  };

  return (
    <Layout
      title="User Activity"
      rightControls={
        <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>
          Refresh
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

      {/* Per-user summary cards */}
      <div className="card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--line)",
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          Users
        </div>
        {loading && <div className="muted" style={{ padding: 24 }}>Loading...</div>}
        {!loading && summary.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>No activity recorded yet.</div>
        )}
        {!loading &&
          summary.map((u, i) => (
            <div
              key={u.username}
              onClick={() => {
                setUsernameFilter(u.username);
                setTimeout(load, 0);
              }}
              style={{
                padding: "14px 24px",
                borderBottom: i < summary.length - 1 ? "1px solid var(--line)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 20,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, minWidth: 140 }}>{u.username}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", minWidth: 70, textTransform: "uppercase" }}>
                {u.role}
              </div>
              <div style={{ fontSize: 12, color: "hsl(130,60%,50%)" }}>{u.logins} logins</div>
              {u.failedLogins > 0 && (
                <div style={{ fontSize: 12, color: "hsl(350,100%,65%)" }}>{u.failedLogins} failed</div>
              )}
              <div style={{ fontSize: 12, color: "hsl(210,100%,60%)" }}>{u.actions} actions</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                Last seen {new Date(u.lastSeen).toLocaleString()}
              </div>
            </div>
          ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 24 }}>
        <form
          onSubmit={applyFilters}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}
        >
          <div>
            <div style={labelStyle}>Username</div>
            <input
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="blank = all users"
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
            />
          </div>
          <div>
            <div style={labelStyle}>Type</div>
            <select
              className="input"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="logins">Logins only</option>
              <option value="actions">Actions only</option>
            </select>
          </div>
          <button className="btn" type="submit" style={{ padding: "10px 20px" }}>
            Filter
          </button>
        </form>
      </div>

      {/* Full activity list */}
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
          <div style={{ fontWeight: 800, fontSize: 15 }}>Activity Log</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {records.length} record{records.length !== 1 ? "s" : ""}
          </div>
        </div>

        {!loading && records.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>No matching records.</div>
        )}

        {!loading && records.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["User", "Role", "Action", "Path", "IP", "Time"].map((h) => (
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
              {records.map((r, i) => (
                <tr
                  key={r._id}
                  style={{ borderBottom: i < records.length - 1 ? "1px solid var(--line)" : "none" }}
                >
                  <td style={{ padding: "12px 24px", fontWeight: 700, fontSize: 13 }}>{r.username}</td>
                  <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>
                    {r.role}
                  </td>
                  <td style={{ padding: "12px 24px" }}>
                    <ActionBadge action={r.action} success={r.success} />
                  </td>
                  <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)" }}>
                    {r.path}
                  </td>
                  <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)" }}>
                    {r.ip}
                  </td>
                  <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
