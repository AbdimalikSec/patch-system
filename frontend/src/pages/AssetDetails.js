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

function TabButton({ active, children, onClick }) {
  return (
    <button
      className="button"
      onClick={onClick}
      style={{
        background: active ? "#111827" : undefined,
        color: active ? "white" : undefined,
        borderColor: active ? "#111827" : undefined,
      }}
    >
      {children}
    </button>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 96vw)",
          maxHeight: "85vh",
          overflow: "auto",
          background: "white",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          <button className="button" onClick={onClose}>Close</button>
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
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("compliance"); // compliance | patch | risk | plan

  // Compliance UI state
  const [cisQuery, setCisQuery] = useState("");
  const [cisPage, setCisPage] = useState(1);
  const pageSize = 20;
  const [selectedCheck, setSelectedCheck] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const [r, p, c] = await Promise.all([
          axios.get(`${API}/api/risk/latest/${encodeURIComponent(hostname)}`),
          axios.get(`${API}/api/patches/latest/${encodeURIComponent(hostname)}`),
          axios.get(`${API}/api/compliance/latest/${encodeURIComponent(hostname)}`),
        ]);

        setRiskRes(r.data);
        setPatchRes(p.data);
        setCompRes(c.data);
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

  const agentStatus = comp?.raw?.agent?.status; // "active" online
  const agentLastSeen = comp?.raw?.agent?.lastKeepAlive || comp?.raw?.agent?.dateAdd || null;

  const osName = comp?.raw?.agent?.os?.name || patch?.os || "-";
  const ipAddr = comp?.raw?.agent?.ip || patch?.raw?.ip || "-";

  const patchList = useMemo(() => {
    if (!patch?.missing) return [];
    return Array.isArray(patch.missing) ? patch.missing : [];
  }, [patch]);

  // Prefer the rich list produced by the updated collector
  const failedChecks = useMemo(() => {
    const arr = comp?.raw?.failedChecks;
    if (Array.isArray(arr)) return arr;
    return [];
  }, [comp]);

  const scaPolicy = comp?.raw?.summary?.policy || null;
  const scaTotal = comp?.raw?.summary?.total ?? comp?.raw?.sca?.data?.affected_items?.[0]?.total_checks ?? null;
  const scaScore = comp?.score ?? comp?.raw?.summary?.score ?? comp?.raw?.sca?.data?.affected_items?.[0]?.score ?? null;
  const scaFailedCount = comp?.failedCount ?? comp?.raw?.summary?.failedCount ?? comp?.raw?.sca?.data?.affected_items?.[0]?.fail ?? null;
  const scaPassCount = comp?.raw?.sca?.data?.affected_items?.[0]?.pass ?? null;
  const scaInvalidCount = comp?.raw?.sca?.data?.affected_items?.[0]?.invalid ?? null;

  const recommendedPlan = useMemo(() => {
    const plan = [];

    if ((risk.priority || "").toLowerCase() === "critical" || (risk.priority || "").toLowerCase() === "high") {
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

  const filteredFailedChecks = useMemo(() => {
    const q = cisQuery.trim().toLowerCase();
    const onlyFailed = failedChecks.filter(x => (x.result || "").toLowerCase() === "failed");

    if (!q) return onlyFailed;

    return onlyFailed.filter(x =>
      String(x.id || "").toLowerCase().includes(q) ||
      String(x.title || "").toLowerCase().includes(q) ||
      String(x.rationale || "").toLowerCase().includes(q) ||
      String(x.remediation || "").toLowerCase().includes(q)
    );
  }, [failedChecks, cisQuery]);

  const pagedChecks = useMemo(() => {
    const start = (cisPage - 1) * pageSize;
    return filteredFailedChecks.slice(start, start + pageSize);
  }, [filteredFailedChecks, cisPage]);

  const totalPages = Math.max(1, Math.ceil(filteredFailedChecks.length / pageSize));

  useEffect(() => {
    // reset pagination on new search
    setCisPage(1);
  }, [cisQuery]);

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
          {/* Header summary */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{hostname}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  OS: {osName} &nbsp;•&nbsp; IP: {ipAddr} &nbsp;•&nbsp; Agent last seen: {agentLastSeen ? String(agentLastSeen) : "-"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={badge(risk.priority)}>
                  <span className="badgeDot"></span>
                  {risk.priority || "Low"} ({risk.score ?? 0})
                </span>
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="kpis" style={{ gridTemplateColumns: "repeat(5, minmax(170px, 1fr))" }}>
            <div className="card">
              <div className="cardLabel">Risk Score</div>
              <div className="cardValue">{risk.score ?? 0}</div>
            </div>

            <div className="card">
              <div className="cardLabel">Priority</div>
              <div className="cardValue">
                <span className={badge(risk.priority)}>
                  <span className="badgeDot"></span>
                  {risk.priority || "Low"}
                </span>
              </div>
            </div>

            <div className="card">
              <div className="cardLabel">Missing patches</div>
              <div className="cardValue">{patch?.missingCount ?? "-"}</div>
            </div>

            <div className="card">
              <div className="cardLabel">CIS score</div>
              <div className="cardValue">{scaScore ?? "-"}</div>
            </div>

            <div className="card">
              <div className="cardLabel">CIS failed</div>
              <div className="cardValue">{scaFailedCount ?? "-"}</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <TabButton active={tab === "compliance"} onClick={() => setTab("compliance")}>Compliance (CIS)</TabButton>
            <TabButton active={tab === "patch"} onClick={() => setTab("patch")}>Patch</TabButton>
            <TabButton active={tab === "risk"} onClick={() => setTab("risk")}>Risk Explanation</TabButton>
            <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>Action Plan</TabButton>
          </div>

          {/* Tab content */}
          <div style={{ marginTop: 12 }}>
            {/* Compliance */}
            {tab === "compliance" && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>CIS / SCA Compliance</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      Policy: {scaPolicy?.name || comp?.raw?.sca?.data?.affected_items?.[0]?.name || "-"}{" "}
                      {scaPolicy?.policy_id ? `(${scaPolicy.policy_id})` : ""}
                      <br />
                      Total: {scaTotal ?? "-"} &nbsp;•&nbsp; Pass: {scaPassCount ?? "-"} &nbsp;•&nbsp; Fail: {scaFailedCount ?? "-"} &nbsp;•&nbsp; Invalid: {scaInvalidCount ?? "-"} &nbsp;•&nbsp; Score: {scaScore ?? "-"}
                      <br />
                      Collected: {comp?.collectedAt ? new Date(comp.collectedAt).toLocaleString() : "-"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="input"
                      placeholder="Search failed checks (ID / title / remediation)..."
                      value={cisQuery}
                      onChange={(e) => setCisQuery(e.target.value)}
                      style={{ minWidth: 320 }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  {failedChecks.length === 0 ? (
                    <div className="muted">
                      No per-check data found yet.
                      <br />
                      ✅ Run the updated <code>collectors_wazuh_sca.js</code> again so it stores <code>raw.failedChecks</code>.
                    </div>
                  ) : (
                    <>
                      <div className="muted" style={{ marginBottom: 8 }}>
                        Showing failed checks: {filteredFailedChecks.length} (page {cisPage}/{totalPages})
                      </div>

                      <div className="tableWrap">
                        <table>
                          <thead>
                            <tr>
                              <th style={{ width: 120 }}>Check ID</th>
                              <th>Title</th>
                              <th style={{ width: 120 }}>Result</th>
                              <th style={{ width: 140 }}>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedChecks.map((c, idx) => (
                              <tr key={`${c.id}-${idx}`}>
                                <td className="muted">{c.id}</td>
                                <td style={{ fontWeight: 600 }}>{c.title}</td>
                                <td>
                                  <span className="badge high">
                                    <span className="badgeDot"></span>
                                    failed
                                  </span>
                                </td>
                                <td>
                                  <button className="button" onClick={() => setSelectedCheck(c)}>
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                        <button
                          className="button"
                          onClick={() => setCisPage((p) => Math.max(1, p - 1))}
                          disabled={cisPage <= 1}
                        >
                          Prev
                        </button>

                        <div className="muted">Page {cisPage} / {totalPages}</div>

                        <button
                          className="button"
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

            {/* Patch */}
            {tab === "patch" && (
              <div className="card">
                <div style={{ fontWeight: 800, fontSize: 14 }}>Patch Details</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Last patch doc: {patch?.collectedAt ? new Date(patch.collectedAt).toLocaleString() : "No data"}
                </div>

                <div style={{ marginTop: 12 }}>
                  {patchList.length === 0 ? (
                    <div className="muted">No missing updates/packages reported.</div>
                  ) : (
                    <div className="tableWrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Missing item</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patchList.slice(0, 500).map((p, i) => (
                            <tr key={i}>
                              <td>{p}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Risk */}
            {tab === "risk" && (
              <div className="card">
                <div style={{ fontWeight: 800, fontSize: 14 }}>Explainable Risk</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Patch collected: {inputs.patchCollectedAt ? new Date(inputs.patchCollectedAt).toLocaleString() : "-"}
                  <br />
                  Compliance collected: {inputs.complianceCollectedAt ? new Date(inputs.complianceCollectedAt).toLocaleString() : "-"}
                </div>

                <div style={{ marginTop: 12 }}>
                  {Array.isArray(risk.reasons) && risk.reasons.length > 0 ? (
                    <ul>
                      {risk.reasons.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="muted">No reasons (risk is low or missing input data).</div>
                  )}
                </div>
              </div>
            )}

            {/* Plan */}
            {tab === "plan" && (
              <div className="card">
                <div style={{ fontWeight: 800, fontSize: 14 }}>Recommended Action Plan (Option B)</div>
                <div style={{ marginTop: 12 }}>
                  <ol>
                    {recommendedPlan.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>

          <Modal
            open={!!selectedCheck}
            title={selectedCheck ? `${selectedCheck.id} — ${selectedCheck.title}` : ""}
            onClose={() => setSelectedCheck(null)}
          >
            {selectedCheck && (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div className="muted" style={{ fontWeight: 700 }}>Rationale</div>
                  <div style={{ marginTop: 4 }}>{selectedCheck.rationale || <span className="muted">No rationale provided.</span>}</div>
                </div>

                <div>
                  <div className="muted" style={{ fontWeight: 700 }}>Remediation</div>
                  <div style={{ marginTop: 4 }}>{selectedCheck.remediation || <span className="muted">No remediation provided.</span>}</div>
                </div>

                {selectedCheck.references && (
                  <div>
                    <div className="muted" style={{ fontWeight: 700 }}>References</div>
                    <div style={{ marginTop: 4 }}>
                      {typeof selectedCheck.references === "string"
                        ? selectedCheck.references
                        : JSON.stringify(selectedCheck.references)}
                    </div>
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
