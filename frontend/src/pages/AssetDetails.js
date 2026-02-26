import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Layout from "../Layout";
import { useParams } from "react-router-dom";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function badge(priority) {
  const p = (priority || "low").toLowerCase();
  const cls = p === "critical" ? "critical" : p === "high" ? "high" : p === "medium" ? "medium" : "low";
  return `badge ${cls}`;
}

function statusBadge(status) {
  if (status === "active") return "badge online";
  if (status) return "badge offline";
  return "badge unknown";
}

function resultBadge(result) {
  const r = (result || "").toLowerCase();
  if (r === "failed") return "badge critical";
  if (r === "passed") return "badge low";
  if (r === "not applicable") return "badge medium";
  return "badge";
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      className={`btn-tab ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="title" style={{ fontSize: "20px" }}>{title}</div>
          <button className="btn" style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--muted)" }} onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export default function AssetDetails() {
  const { hostname } = useParams();

  const [riskRes, setRiskRes] = useState(null);
  const [patchRes, setPatchRes] = useState(null);
  const [compRes, setCompRes] = useState(null);
  const [checksRes, setChecksRes] = useState([]);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("compliance");
  const [cisQuery, setCisQuery] = useState("");
  const [cisPage, setCisPage] = useState(1);
  const [resultFilter, setResultFilter] = useState("all");
  const pageSize = 20;
  const [selectedCheck, setSelectedCheck] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const [r, p, c, ch] = await Promise.all([
          axios.get(`${API}/api/risk/latest/${encodeURIComponent(hostname)}`),
          axios.get(`${API}/api/patches/latest/${encodeURIComponent(hostname)}`),
          axios.get(`${API}/api/compliance/latest/${encodeURIComponent(hostname)}`),
          axios.get(`${API}/api/compliance/checks/${encodeURIComponent(hostname)}`),
        ]);

        setRiskRes(r.data);
        setPatchRes(p.data);
        setCompRes(c.data);
        setChecksRes(ch.data?.data || []);
      } catch (e) {
        setErr(e?.message || "Failed to load asset details");
      } finally {
        setLoading(false);
      }
    })();
  }, [hostname]);

  const risk = riskRes?.risk || { score: 0, priority: "Low", reasons: [] };
  const inputs = riskRes?.inputs || {};
  const patch = patchRes?.data || null;
  const comp = compRes?.data || null;

  const agentStatus = comp?.raw?.agent?.status;
  const agentLastSeen = comp?.raw?.agent?.lastKeepAlive || comp?.raw?.agent?.dateAdd || null;
  const osName = comp?.raw?.agent?.os?.name || patch?.os || "-";
  const ipAddr = comp?.raw?.agent?.ip || patch?.raw?.ip || "-";

  const patchList = useMemo(() => {
    if (!patch?.missing) return [];
    return Array.isArray(patch.missing) ? patch.missing : [];
  }, [patch]);

  const scaPolicy = comp?.raw?.summary?.policy || null;
  const scaTotal = comp?.raw?.summary?.total ?? comp?.raw?.sca?.data?.affected_items?.[0]?.total_checks ?? null;
  const scaScore = comp?.score ?? comp?.raw?.summary?.score ?? comp?.raw?.sca?.data?.affected_items?.[0]?.score ?? null;
  const scaFailedCount = comp?.failedCount ?? comp?.raw?.summary?.failedCount ?? comp?.raw?.sca?.data?.affected_items?.[0]?.fail ?? null;
  const scaPassCount = comp?.raw?.sca?.data?.affected_items?.[0]?.pass ?? null;
  const scaInvalidCount = comp?.raw?.sca?.data?.affected_items?.[0]?.invalid ?? null;

  const filteredChecks = useMemo(() => {
    let list = checksRes;
    if (resultFilter !== "all") {
      list = list.filter((x) => (x.result || "").toLowerCase() === resultFilter);
    }
    const q = cisQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((x) =>
        String(x.checkId || "").toLowerCase().includes(q) ||
        String(x.title || "").toLowerCase().includes(q) ||
        String(x.rationale || "").toLowerCase().includes(q) ||
        String(x.remediation || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [checksRes, resultFilter, cisQuery]);

  const pagedChecks = useMemo(() => {
    const start = (cisPage - 1) * pageSize;
    return filteredChecks.slice(start, start + pageSize);
  }, [filteredChecks, cisPage]);

  const totalPages = Math.max(1, Math.ceil(filteredChecks.length / pageSize));

  useEffect(() => { setCisPage(1); }, [cisQuery, resultFilter]);

  const recommendedPlan = useMemo(() => {
    const plan = [];
    if (["critical", "high"].includes((risk.priority || "").toLowerCase())) {
      plan.push("Schedule patch window within 24–48 hours.");
    } else if ((risk.priority || "").toLowerCase() === "medium") {
      plan.push("Schedule patch window within 7 days.");
    } else {
      plan.push("Patch in next regular maintenance cycle.");
    }

    if ((patch?.missingCount ?? 0) > 0) {
      plan.push(`Review ${patch.missingCount} pending updates/packages and prioritize security updates first.`);
    } else {
      plan.push("No missing patch items reported by collectors (verify collectors ran recently).");
    }

    if ((comp?.failedCount ?? 0) > 0) {
      plan.push(`Address ${comp.failedCount} CIS/SCA compliance failures before next audit review.`);
    } else {
      plan.push("Compliance shows no failures or no SCA data collected yet.");
    }
    plan.push("Re-run collectors and validate risk score decreases.");
    return plan;
  }, [risk.priority, patch?.missingCount, comp?.failedCount]);

  const countAll = checksRes.length;
  const countFailed = checksRes.filter((x) => x.result === "failed").length;
  const countPassed = checksRes.filter((x) => x.result === "passed").length;
  const countNA = checksRes.filter((x) => x.result === "not applicable").length;

  const headerRight = (
    <span className={statusBadge(agentStatus)}>
      <span className="badgeDot"></span>
      {agentStatus === "active" ? "Online" : agentStatus ? "Offline" : "Unknown"}
    </span>
  );

  return (
    <Layout title={`Asset: ${hostname}`} rightControls={headerRight}>
      {loading && <div className="muted">Loading...</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      {!loading && !err && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 900, letterSpacing: "-0.5px" }}>{hostname}</div>
                <div className="muted" style={{ marginTop: 6, fontSize: "14px" }}>
                  <span style={{ color: "var(--accent)" }}>{osName}</span> &nbsp;•&nbsp; IP: {ipAddr} &nbsp;•&nbsp; Last collection: {agentLastSeen ? new Date(agentLastSeen).toLocaleString() : "-"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={badge(risk.priority)}>
                  {risk.priority || "Low"} — Score {risk.score ?? 0}
                </span>
              </div>
            </div>
          </div>

          <div className="kpis">
            <div className="card">
              <div className="cardLabel">Risk Score</div>
              <div className="cardValue" style={{ color: "var(--accent)" }}>{risk.score ?? 0}</div>
            </div>

            <div className="card">
              <div className="cardLabel">Priority</div>
              <div className="cardValue">
                <span className={badge(risk.priority)}>{risk.priority || "Low"}</span>
              </div>
            </div>

            <div className="card">
              <div className="cardLabel">Missing updates</div>
              <div className="cardValue">{patch?.missingCount ?? "-"}</div>
            </div>

            <div className="card">
              <div className="cardLabel">CIS score</div>
              <div className="cardValue">{scaScore ?? "-"}</div>
            </div>

            <div className="card">
              <div className="cardLabel">CIS failed</div>
              <div className="cardValue" style={{ color: (scaFailedCount > 0 ? "hsl(350, 100%, 65%)" : "inherit") }}>{scaFailedCount ?? "-"}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            <TabButton active={tab === "compliance"} onClick={() => setTab("compliance")}>Compliance (CIS)</TabButton>
            <TabButton active={tab === "patch"} onClick={() => setTab("patch")}>Patch Backlog</TabButton>
            <TabButton active={tab === "risk"} onClick={() => setTab("risk")}>Risk Intelligence</TabButton>
            <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>Remediation Plan</TabButton>
          </div>

          <div className="tabContent">
            {tab === "compliance" && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>CIS / SCA Compliance Details</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: "13px" }}>
                      Policy: <span style={{ color: "var(--text)" }}>{scaPolicy?.name || comp?.raw?.sca?.data?.affected_items?.[0]?.name || "-"}</span>
                    </div>
                  </div>

                  <input
                    className="input"
                    placeholder="Search check ID, title, or remediation..."
                    value={cisQuery}
                    onChange={(e) => setCisQuery(e.target.value)}
                    style={{ minWidth: 350 }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {[
                    { key: "all", label: `All Checks (${countAll})` },
                    { key: "failed", label: `Failed (${countFailed})` },
                    { key: "passed", label: `Passed (${countPassed})` },
                    { key: "not applicable", label: `N/A (${countNA})` },
                  ].map((f) => (
                    <button
                      key={f.key}
                      className={`btn-tab ${resultFilter === f.key ? "active" : ""}`}
                      onClick={() => setResultFilter(f.key)}
                      style={{ fontSize: "12px", padding: "6px 14px" }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="tableWrap">
                  {checksRes.length === 0 ? (
                    <div className="muted" style={{ padding: 20 }}>No compliance data collected for this asset.</div>
                  ) : filteredChecks.length === 0 ? (
                    <div className="muted" style={{ padding: 20 }}>No checks match your current filter.</div>
                  ) : (
                    <>
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: 100 }}>ID</th>
                            <th>Title</th>
                            <th style={{ width: 140 }}>Result</th>
                            <th style={{ width: 100, textAlign: "center" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedChecks.map((c) => (
                            <tr key={c.checkId}>
                              <td className="mono" style={{ color: "var(--accent)" }}>{c.checkId}</td>
                              <td style={{ fontWeight: 500 }}>{c.title}</td>
                              <td>
                                <span className={resultBadge(c.result)}>{c.result}</span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <button className="btn" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={() => setSelectedCheck(c)}>
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderTop: "1px solid var(--line)" }}>
                        <button
                          className="btn"
                          onClick={() => setCisPage((p) => Math.max(1, p - 1))}
                          disabled={cisPage <= 1}
                        >
                          Previous
                        </button>
                        <div className="muted" style={{ fontSize: "13px" }}>Page {cisPage} of {totalPages}</div>
                        <button
                          className="btn"
                          onClick={() => setCisPage((p) => Math.min(totalPages, p + 1))}
                          disabled={cisPage >= totalPages}
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {tab === "patch" && (
              <div className="card">
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Patch Backlog</div>
                {patchList.length === 0 ? (
                  <div className="muted">No missing updates reported.</div>
                ) : (
                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr><th>Missing Package / Update Name</th></tr>
                      </thead>
                      <tbody>
                        {patchList.map((p, i) => (
                          <tr key={i}>
                            <td className="mono" style={{ fontSize: "13px" }}>{p}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === "risk" && (
              <div className="card">
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Risk Intelligence Explanation</div>
                <div className="tableWrap" style={{ padding: 24 }}>
                  {Array.isArray(risk.reasons) && risk.reasons.length > 0 ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      {risk.reasons.map((x, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", marginTop: 6 }}></div>
                          <div style={{ fontSize: "15px", lineHeight: "1.6" }}>{x}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted">No specific risk factors identified.</div>
                  )}
                </div>
              </div>
            )}

            {tab === "plan" && (
              <div className="card">
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Recommended Action Plan</div>
                <div className="tableWrap" style={{ padding: 24 }}>
                  <div style={{ display: "grid", gap: 16 }}>
                    {recommendedPlan.map((x, i) => (
                      <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent-muted)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, flexShrink: 0 }}>
                          {i + 1}
                        </div>
                        <div style={{ fontSize: "15px", lineHeight: "1.6" }}>{x}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Modal
            open={!!selectedCheck}
            title={selectedCheck ? `Check ${selectedCheck.checkId}` : ""}
            onClose={() => setSelectedCheck(null)}
          >
            {selectedCheck && (
              <div style={{ display: "grid", gap: 20 }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: 8 }}>{selectedCheck.title}</div>
                  <span className={resultBadge(selectedCheck.result)}>{selectedCheck.result}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div>
                    <div className="cardLabel">Description</div>
                    <div style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text)" }}>
                      {selectedCheck.description || "No description provided."}
                    </div>
                  </div>
                  <div>
                    <div className="cardLabel">Rationale</div>
                    <div style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text)" }}>
                      {selectedCheck.rationale || "No rationale provided."}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="cardLabel">Remediation</div>
                  <div style={{
                    padding: 24,
                    background: "var(--accent-muted)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--accent-border)",
                    lineHeight: "1.6",
                    color: "#fff",
                    fontWeight: 600,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                  }}>
                    {selectedCheck.remediation || "No remediation steps provided."}
                  </div>
                </div>

                {Array.isArray(selectedCheck.command) && selectedCheck.command.length > 0 && (
                  <div>
                    <div className="cardLabel">Verification Command</div>
                    <pre>{selectedCheck.command.join("\n")}</pre>
                  </div>
                )}
              </div>
            )}
          </Modal>
        </>
      )}
    </Layout>
  );
}
