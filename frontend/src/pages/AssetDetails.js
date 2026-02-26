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
  const [checksRes, setChecksRes] = useState([]);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("compliance");

  const [cisQuery, setCisQuery] = useState("");
  const [cisPage, setCisPage] = useState(1);
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
          axios.get(`${API}/api/compliance/checks/${encodeURIComponent(hostname)}`)
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

  // NEW: use normalized collection instead of raw.failedChecks
  const failedChecks = useMemo(() => {
    const onlyFailed = checksRes.filter(x => (x.result || "").toLowerCase() === "failed");
    return onlyFailed;
  }, [checksRes]);

  const scaScore = comp?.score ?? null;
  const scaFailedCount = comp?.failedCount ?? null;

  const filteredFailedChecks = useMemo(() => {
    const q = cisQuery.trim().toLowerCase();
    if (!q) return failedChecks;

    return failedChecks.filter(x =>
      String(x.checkId || "").toLowerCase().includes(q) ||
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
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{hostname}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  OS: {osName} • IP: {ipAddr} • Agent last seen: {agentLastSeen ? String(agentLastSeen) : "-"}
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

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <TabButton active={tab === "compliance"} onClick={() => setTab("compliance")}>Compliance (CIS)</TabButton>
            <TabButton active={tab === "patch"} onClick={() => setTab("patch")}>Patch</TabButton>
            <TabButton active={tab === "risk"} onClick={() => setTab("risk")}>Risk Explanation</TabButton>
          </div>

          {tab === "compliance" && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>CIS Failed Checks</div>
                <input
                  className="input"
                  placeholder="Search failed checks..."
                  value={cisQuery}
                  onChange={(e) => setCisQuery(e.target.value)}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                {failedChecks.length === 0 ? (
                  <div className="muted">No failed checks found.</div>
                ) : (
                  <>
                    <div className="tableWrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Check ID</th>
                            <th>Title</th>
                            <th>Result</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedChecks.map((c) => (
                            <tr key={c.checkId}>
                              <td>{c.checkId}</td>
                              <td>{c.title}</td>
                              <td>
                                <span className="badge critical">
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

          <Modal
            open={!!selectedCheck}
            title={selectedCheck ? `${selectedCheck.checkId} — ${selectedCheck.title}` : ""}
            onClose={() => setSelectedCheck(null)}
          >
            {selectedCheck && (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <strong>Description</strong>
                  <div>{selectedCheck.description}</div>
                </div>
                <div>
                  <strong>Rationale</strong>
                  <div>{selectedCheck.rationale}</div>
                </div>
                <div>
                  <strong>Remediation</strong>
                  <div>{selectedCheck.remediation}</div>
                </div>
                {Array.isArray(selectedCheck.command) && selectedCheck.command.length > 0 && (
                  <div>
                    <strong>Command</strong>
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