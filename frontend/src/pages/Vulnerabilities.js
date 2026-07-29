import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const SEVERITY_COLOR = {
  critical: { bg: "hsla(350,100%,65%,0.15)", border: "hsl(350,100%,65%)", text: "hsl(350,100%,65%)" },
  high:     { bg: "hsla(25,100%,60%,0.15)", border: "hsl(25,100%,60%)", text: "hsl(25,100%,60%)" },
  medium:   { bg: "hsla(45,100%,50%,0.15)", border: "hsl(45,100%,50%)", text: "hsl(45,100%,50%)" },
  low:      { bg: "hsla(130,60%,50%,0.15)", border: "hsl(130,60%,50%)", text: "hsl(130,60%,50%)" },
};

function SeverityBadge({ severity }) {
  const sev = (severity || "").toLowerCase();
  const c = SEVERITY_COLOR[sev] || { bg: "hsla(210,15%,60%,0.15)", border: "hsl(210,15%,60%)", text: "hsl(210,15%,60%)" };
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
      {severity || "unknown"}
    </span>
  );
}

async function exportVulnerabilityReport(summary, setExporting) {
  setExporting(true);
  try {
    const results = await Promise.all(
      summary.map(async (s) => {
        try {
          const res = await axios.get(`${API}/api/vulnerabilities/${encodeURIComponent(s.hostname)}`);
          return { hostname: s.hostname, os: s.os, cves: res.data?.data || [] };
        } catch {
          return { hostname: s.hostname, os: s.os, cves: [] };
        }
      }),
    );

    const header = ["Hostname", "OS", "CVE", "Package", "Version", "Severity", "CVSS", "Condition", "Published"];
    const lines = [
      [`Vulnerability Report — All Monitored Assets`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      header,
    ];

    let totalCves = 0;
    for (const r of results) {
      if (r.cves.length === 0) {
        lines.push([r.hostname, r.os, "No known CVEs", "", "", "", "", "", ""]);
        continue;
      }
      for (const c of r.cves) {
        totalCves++;
        lines.push([
          r.hostname,
          r.os,
          c.cve,
          c.package || "",
          c.version || "",
          c.severity || "Unknown",
          c.cvssScore != null ? c.cvssScore.toFixed(1) : "",
          c.condition || "",
          c.published ? new Date(c.published).toLocaleDateString() : "",
        ]);
      }
    }

    lines.splice(2, 0, [`Total CVEs across fleet: ${totalCves}`]);

    const csv = lines
      .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vulnerability-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}


function CVEDetailTable({ hostname }) {
  const [cves, setCves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErr("");
        const res = await axios.get(`${API}/api/vulnerabilities/${encodeURIComponent(hostname)}`);
        setCves(res.data?.data || []);
      } catch (e) {
        setErr(e?.response?.data?.error || "Failed to load CVE details");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [hostname]);

  const filtered = severityFilter
    ? cves.filter((c) => (c.severity || "").toLowerCase() === severityFilter)
    : cves;

  if (loading) return <div className="muted" style={{ padding: 16 }}>Loading CVE details...</div>;
  if (err) return <div style={{ padding: 16, color: "hsl(350,100%,65%)", fontSize: 13 }}>{err}</div>;
  if (cves.length === 0) return <div className="muted" style={{ padding: 16 }}>No known CVEs for this machine.</div>;

  return (
    <div style={{ padding: "0 0 16px 0" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {["", "critical", "high", "medium", "low"].map((s) => (
          <button
            key={s || "all"}
            className="btn"
            onClick={() => setSeverityFilter(s)}
            style={{
              fontSize: 11,
              padding: "4px 12px",
              background: severityFilter === s ? "var(--accent-muted)" : "transparent",
              textTransform: "capitalize",
            }}
          >
            {s || "All"}
          </button>
        ))}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line)" }}>
            {["CVE", "Package", "Version", "Severity", "Condition", "Published"].map((h) => (
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
          {filtered.map((c, i) => (
            <tr key={`${c.cve}-${i}`} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>
                {c.references?.[0] ? (
                  <a href={c.references[0]} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>
                    {c.cve}
                  </a>
                ) : (
                  c.cve
                )}
              </td>
              <td style={{ padding: "8px 12px", fontSize: 12 }}>{c.package}</td>
              <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--muted)" }}>{c.version}</td>
              <td style={{ padding: "8px 12px" }}>
                <SeverityBadge severity={c.severity} />
              </td>
              <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted)" }}>{c.condition || "-"}</td>
              <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted)" }}>
                {c.published ? new Date(c.published).toLocaleDateString() : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Vulnerabilities() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [exporting, setExporting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/vulnerabilities/summary`);
      setSummary(res.data?.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load vulnerability summary");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = summary.reduce(
    (acc, s) => {
      acc.critical += s.critical || 0;
      acc.high += s.high || 0;
      acc.medium += s.medium || 0;
      acc.low += s.low || 0;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );

  return (
    <Layout
      title="Vulnerabilities"
        rightControls={
        <>
          <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>
            Refresh
          </button>
          <button
            className="btn"
            onClick={() => exportVulnerabilityReport(summary, setExporting)}
            disabled={exporting || summary.length === 0}
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            {exporting ? "Exporting..." : "Export Report (CSV)"}
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

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Critical", value: totals.critical, color: "hsl(350,100%,65%)" },
          { label: "High", value: totals.high, color: "hsl(25,100%,60%)" },
          { label: "Medium", value: totals.medium, color: "hsl(45,100%,50%)" },
          { label: "Low", value: totals.low, color: "hsl(130,60%,50%)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ flex: 1, minWidth: 130, padding: "14px 18px" }}>
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
          <div style={{ fontWeight: 800, fontSize: 15 }}>CVEs by Machine</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {summary.length} machine{summary.length !== 1 ? "s" : ""}
          </div>
        </div>

        {loading && <div className="muted" style={{ padding: 24 }}>Loading vulnerability data...</div>}
        {!loading && summary.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>
            No machines with a Wazuh agent ID found.
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
                  <div style={{ fontSize: 12, color: "var(--muted)", minWidth: 80 }}>
                    {(s.os || "-").toUpperCase()}
                  </div>
                  <div style={{ display: "flex", gap: 8, flex: 1 }}>
                    {s.critical > 0 && <SeverityBadge severity={`critical (${s.critical})`} />}
                    {s.high > 0 && <SeverityBadge severity={`high (${s.high})`} />}
                    {s.medium > 0 && <SeverityBadge severity={`medium (${s.medium})`} />}
                    {s.low > 0 && <SeverityBadge severity={`low (${s.low})`} />}
                    {s.total === 0 && !s.error && (
                      <span style={{ fontSize: 12, color: "hsl(130,60%,50%)" }}>✓ No known CVEs</span>
                    )}
                    {s.error && (
                      <span style={{ fontSize: 11, color: "hsl(350,100%,65%)" }}>{s.error}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{isOpen ? "▲" : "▼"}</div>
                </div>
                {isOpen && (
                  <div style={{ padding: "0 24px" }}>
                    <CVEDetailTable hostname={s.hostname} />
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </Layout>
  );
}
