import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function severityColor(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return "hsl(350,75%,50%)";
  if (s === "high") return "hsl(25,90%,50%)";
  if (s === "moderate") return "hsl(45,90%,45%)";
  return "hsl(145,55%,38%)";
}

function EvidenceCard({ title, control, children }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>{control}</div>
      {children}
    </div>
  );
}

export default function PlatformCompliance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/platform-compliance`);
      setData(res.data?.data || null);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load platform compliance evidence");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout
      title="Platform Compliance Evidence"
      rightControls={
        <button className="btn" onClick={load} style={{ fontSize: 12, padding: "6px 14px" }}>
          Refresh
        </button>
      }
    >
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, maxWidth: 760 }}>
        Triarch monitors compliance across the fleet it manages. This page turns that same
        scrutiny on Triarch itself — what the platform's own architecture already proves
        about access control, logging, credential handling, and its own software supply chain.
      </div>

      {err && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 20,
            background: "hsla(350,75%,50%,0.08)",
            border: "1px solid hsla(350,75%,50%,0.25)",
            color: "hsl(350,75%,45%)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {loading && <div className="muted" style={{ padding: 20 }}>Loading...</div>}

      {!loading && data && (
        <>
          <EvidenceCard
            title="Access Control"
            control={data.accessControl.control}
          >
            <div style={{ fontSize: 13, marginBottom: 10 }}>{data.accessControl.evidence}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {data.accessControl.roles.map((r) => (
                <span
                  key={r}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 5,
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    textTransform: "capitalize",
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          </EvidenceCard>

          <EvidenceCard
            title="Audit Logging"
            control={data.auditLogging.control}
          >
            <div style={{ fontSize: 13 }}>{data.auditLogging.evidence}</div>
            {data.auditLogging.since && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Logging active since {new Date(data.auditLogging.since).toLocaleDateString()}
              </div>
            )}
          </EvidenceCard>

          <EvidenceCard
            title="Credential Storage"
            control={data.credentialStorage.control}
          >
            <div style={{ fontSize: 13 }}>{data.credentialStorage.evidence}</div>
          </EvidenceCard>

          <EvidenceCard
            title="Own Software Supply Chain"
            control={data.dependencyVulnerabilities.control}
          >
            <div style={{ fontSize: 13, marginBottom: 14 }}>{data.dependencyVulnerabilities.evidence}</div>

            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {["critical", "high", "moderate", "low"].map((sev) => (
                <div
                  key={sev}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "var(--surface)",
                    border: `1px solid ${severityColor(sev)}33`,
                    minWidth: 90,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                    {sev}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: severityColor(sev) }}>
                    {data.dependencyVulnerabilities.severityCounts[sev] ?? 0}
                  </div>
                </div>
              ))}
            </div>

            {data.dependencyVulnerabilities.active.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                No active dependency vulnerabilities found in the most recent audit.
              </div>
            ) : (
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Advisory</th>
                      <th style={{ width: 100 }}>Severity</th>
                      <th style={{ width: 90 }}>Fix Available</th>
                      <th style={{ width: 110 }}>Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dependencyVulnerabilities.active.map((v) => (
                      <tr key={v._id}>
                        <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{v.packageName}</td>
                        <td style={{ fontSize: 12 }}>
                          {v.advisoryUrl ? (
                            <a href={v.advisoryUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                              {v.advisoryTitle || "View advisory"}
                            </a>
                          ) : (
                            v.advisoryTitle || "—"
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 4,
                              color: severityColor(v.severity),
                              background: `${severityColor(v.severity)}18`,
                              border: `1px solid ${severityColor(v.severity)}44`,
                              textTransform: "capitalize",
                            }}
                          >
                            {v.severity}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{v.fixAvailable ? "Yes" : "No"}</td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {new Date(v.detectedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EvidenceCard>
        </>
      )}
    </Layout>
  );
}
