import { useEffect, useMemo, useState } from "react";
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

const PERIOD_PRESETS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "custom", label: "Custom range", days: null },
];

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function exportReportCSV(records, periodLabel) {
  const header = ["Username", "Role", "Event", "Path", "IP Address", "Timestamp"];
  const lines = [
    [`Login & Access Report — ${periodLabel}`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    header,
  ];
  for (const r of records) {
    lines.push([
      r.username,
      r.role,
      r.action === "login_success" ? "Login Success" : r.action === "login_failed" ? "Login Failed" : r.action,
      r.path || "",
      r.ip || "",
      new Date(r.createdAt).toLocaleString(),
    ]);
  }
  const csv = lines
    .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `login-access-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function KpiCard({ label, value, color }) {
  return (
    <div className="card">
      <div className="cardLabel">{label}</div>
      <div className="cardValue" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default function LoginReport() {
  const [period, setPeriod] = useState("30");
  const [customSince, setCustomSince] = useState("");
  const [customUntil, setCustomUntil] = useState("");
  const [usernameFilter, setUsernameFilter] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const periodLabel = useMemo(() => {
    if (period === "custom") {
      if (!customSince && !customUntil) return "All time";
      return `${customSince || "…"} to ${customUntil || "now"}`;
    }
    const preset = PERIOD_PRESETS.find((p) => p.key === period);
    return preset?.label || "All time";
  }, [period, customSince, customUntil]);

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const params = { limit: 5000 };
      if (usernameFilter.trim()) params.username = usernameFilter.trim();

      if (period === "custom") {
        if (customSince) params.since = new Date(customSince).toISOString();
        if (customUntil) {
          const until = new Date(customUntil);
          until.setHours(23, 59, 59, 999);
          params.until = until.toISOString();
        }
      } else {
        const preset = PERIOD_PRESETS.find((p) => p.key === period);
        if (preset?.days) params.since = isoDaysAgo(preset.days);
      }

      const res = await axios.get(`${API}/api/user-activity`, { params });
      setRecords(res.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load login/access report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function handleApplyCustom(e) {
    e.preventDefault();
    load();
  }

  const stats = useMemo(() => {
    const loginSuccess = records.filter((r) => r.action === "login_success").length;
    const loginFailed = records.filter((r) => r.action === "login_failed").length;
    const uniqueUsers = new Set(records.map((r) => r.username)).size;
    const otherActions = records.length - loginSuccess - loginFailed;
    return { loginSuccess, loginFailed, uniqueUsers, otherActions };
  }, [records]);

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
      title="Login & Access Report"
      rightControls={
        <>
          <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>
            Refresh
          </button>
          <button
            className="btn"
            onClick={() => exportReportCSV(records, periodLabel)}
            disabled={records.length === 0}
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            Export Report (CSV)
          </button>
        </>
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

      {/* Period selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: period === "custom" ? 16 : 0, flexWrap: "wrap" }}>
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`btn-tab ${period === p.key ? "active" : ""}`}
              style={{ fontSize: 12, padding: "7px 14px" }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <form onSubmit={handleApplyCustom} style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <div style={labelStyle}>From</div>
              <input
                type="date"
                className="input"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
              />
            </div>
            <div>
              <div style={labelStyle}>To</div>
              <input
                type="date"
                className="input"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={labelStyle}>Username (optional)</div>
              <input
                className="input"
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="blank = all users"
                value={usernameFilter}
                onChange={(e) => setUsernameFilter(e.target.value)}
              />
            </div>
            <button className="btn" type="submit" style={{ padding: "10px 20px" }}>
              Apply
            </button>
          </form>
        )}
        {period !== "custom" && (
          <div style={{ display: "flex", gap: 12, alignItems: "end", marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={labelStyle}>Username (optional)</div>
              <input
                className="input"
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="blank = all users"
                value={usernameFilter}
                onChange={(e) => setUsernameFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
              />
            </div>
            <button className="btn" onClick={load} style={{ padding: "10px 20px" }}>
              Filter
            </button>
          </div>
        )}
      </div>

      {/* Period summary KPIs */}
      <div className="kpis" style={{ marginBottom: 24 }}>
        <KpiCard label="Successful Logins" value={stats.loginSuccess} color="hsl(130,60%,50%)" />
        <KpiCard label="Failed Logins" value={stats.loginFailed} color={stats.loginFailed > 0 ? "hsl(350,100%,65%)" : undefined} />
        <KpiCard label="Unique Users" value={stats.uniqueUsers} />
        <KpiCard label="Other Actions" value={stats.otherActions} />
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        Showing data for: <strong style={{ color: "var(--text)" }}>{periodLabel}</strong>
      </div>

      {/* Full event table */}
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
          <div style={{ fontWeight: 800, fontSize: 15 }}>Event Log</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {records.length} record{records.length !== 1 ? "s" : ""}
          </div>
        </div>

        {loading && <div className="muted" style={{ padding: 24 }}>Loading...</div>}
        {!loading && records.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>No events found for this period.</div>
        )}

        {!loading && records.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["User", "Role", "Event", "Path", "IP", "Time"].map((h) => (
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
                <tr key={r._id} style={{ borderBottom: i < records.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <td style={{ padding: "12px 24px", fontWeight: 700, fontSize: 13 }}>{r.username}</td>
                  <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>
                    {r.role}
                  </td>
                  <td style={{ padding: "12px 24px" }}>
                    <ActionBadge action={r.action} success={r.success} />
                  </td>
                  <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)" }}>{r.path}</td>
                  <td style={{ padding: "12px 24px", fontSize: 12, color: "var(--muted)" }}>{r.ip}</td>
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
