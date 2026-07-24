import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function ResultBadge({ result }) {
  const isSuccess = result === "success";
  const isFailed = result === "failed";
  const c = isSuccess
    ? { bg: "hsla(130,60%,50%,0.15)", border: "hsl(130,60%,50%)", text: "hsl(130,60%,50%)" }
    : isFailed
    ? { bg: "hsla(350,100%,65%,0.15)", border: "hsl(350,100%,65%)", text: "hsl(350,100%,65%)" }
    : { bg: "hsla(210,15%,60%,0.15)", border: "hsl(210,15%,60%)", text: "hsl(210,15%,60%)" };

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 4,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        textTransform: "uppercase",
      }}
    >
      {result}
    </span>
  );
}

function AuditDetailTable({ hostname }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [resultFilter, setResultFilter] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErr("");
        const res = await axios.get(`${API}/api/audit-log/${encodeURIComponent(hostname)}`);
        setEvents(res.data?.data || []);
      } catch (e) {
        setErr(e?.response?.data?.error || "Failed to load login events");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [hostname]);

  const filtered = resultFilter ? events.filter((e) => e.result === resultFilter) : events;

  if (loading) return <div className="muted" style={{ padding: 16 }}>Loading login events...</div>;
  if (err) return <div style={{ padding: 16, color: "hsl(350,100%,65%)", fontSize: 13 }}>{err}</div>;
  if (events.length === 0) return <div className="muted" style={{ padding: 16 }}>No login events found for this machine.</div>;

  return (
    <div style={{ padding: "0 0 16px 0" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {["", "success", "failed"].map((r) => (
          <button
            key={r || "all"}
            className="btn"
            onClick={() => setResultFilter(r)}
            style={{
              fontSize: 11,
              padding: "4px 12px",
              background: resultFilter === r ? "var(--accent-muted)" : "transparent",
              textTransform: "capitalize",
            }}
          >
            {r || "All"}
          </button>
        ))}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line)" }}>
            {["User", "Source IP", "Result", "Description", "Timestamp"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  fontSize: 10,
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
          {filtered.map((e, i) => (
            <tr key={`${e.timestamp}-${i}`} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>{e.user}</td>
              <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--muted)" }}>{e.srcIp}</td>
              <td style={{ padding: "8px 12px" }}>
                <ResultBadge result={e.result} />
              </td>
              <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted)" }}>{e.description}</td>
              <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {new Date(e.timestamp).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditLog() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/audit-log/summary`);
      setSummary(res.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load audit log summary");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = summary.reduce(
    (acc, s) => {
      acc.success += s.success || 0;
      acc.failed += s.failed || 0;
      return acc;
    },
    { success: 0, failed: 0 }
  );

  return (
    <Layout
      title="Audit Log"
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

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Successful Logins", value: totals.success, color: "hsl(130,60%,50%)" },
          { label: "Failed Logins", value: totals.failed, color: "hsl(350,100%,65%)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ flex: 1, minWidth: 160, padding: "14px 18px" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: value > 0 ? color : "inherit" }}>
              {value}
            </div>
          </div>
        ))}
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
          <div style={{ fontWeight: 800, fontSize: 15 }}>Logins by Machine</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {summary.length} machine{summary.length !== 1 ? "s" : ""}
          </div>
        </div>

        {loading && <div className="muted" style={{ padding: 24 }}>Loading audit data...</div>}
        {!loading && summary.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>
            No login events indexed yet.
          </div>
        )}

        {!loading &&
          summary.map((s, i) => {
            const isOpen = expanded === s.hostname;
            return (
              <div key={s.hostname}>
                <div
                  onClick={() => setExpanded(isOpen ? null : s.hostname)}
                  style={{
                    padding: "14px 24px",
                    borderBottom: i < summary.length - 1 || isOpen ? "1px solid var(--line)" : "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, minWidth: 180 }}>{s.hostname}</div>
                  <div style={{ display: "flex", gap: 8, flex: 1 }}>
                    {s.success > 0 && <ResultBadge result={`success (${s.success})`} />}
                    {s.failed > 0 && <ResultBadge result={`failed (${s.failed})`} />}
                    {s.total === 0 && (
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>No events</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{isOpen ? "▲" : "▼"}</div>
                </div>
                {isOpen && (
                  <div style={{ padding: "0 24px" }}>
                    <AuditDetailTable hostname={s.hostname} />
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </Layout>
  );
}																										
