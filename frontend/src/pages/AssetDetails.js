import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Layout from "../Layout";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";
const USERS = ["admin", "analyst"];

function badge(priority) {
  const p = (priority || "low").toLowerCase();
  const cls =
    p === "critical"
      ? "critical"
      : p === "high"
        ? "high"
        : p === "medium"
          ? "medium"
          : "low";
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

function ticketStatusColor(s) {
  return (
    {
      open: "hsl(350,100%,65%)",
      "in-progress": "hsl(45,100%,50%)",
      resolved: "hsl(130,60%,50%)",
    }[s] || "var(--muted)"
  );
}

function ticketStatusLabel(s) {
  return (
    { open: "Open", "in-progress": "In Progress", resolved: "Resolved" }[s] || s
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button className={`btn-tab ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AssetDetails() {
  const { hostname } = useParams();

  const [riskRes, setRiskRes] = useState(null);
  const [patchRes, setPatchRes] = useState(null);
  const [compRes, setCompRes] = useState(null);
  const [checksRes, setChecksRes] = useState([]);
  const [ticketMap, setTicketMap] = useState({}); // checkId -> ticket
  const [tickets, setTickets] = useState([]);
  const navigate = useNavigate();
  const [agentStatus, setAgentStatus] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("compliance");
  const [cisQuery, setCisQuery] = useState("");
  const [cisPage, setCisPage] = useState(1);
  const [resultFilter, setResultFilter] = useState("all");
  const pageSize = 20;
  const [cveMatches, setCveMatches] = useState([]);
  const [expandedPkg, setExpandedPkg] = useState(null);
  const [selectedCheck, setSelectedCheck] = useState(null);

  const loadTickets = useCallback(async () => {
    try {
      const [mapRes, listRes] = await Promise.all([
        axios.get(`${API}/api/tickets/${encodeURIComponent(hostname)}/map`),
        axios.get(`${API}/api/tickets/${encodeURIComponent(hostname)}`),
      ]);
      setTicketMap(mapRes.data?.data || {});
      setTickets(listRes.data?.data || []);
    } catch {}
  }, [hostname]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const [r, p, c, ch, cve] = await Promise.all([
          axios.get(`${API}/api/risk/latest/${encodeURIComponent(hostname)}`),
          axios.get(
            `${API}/api/patches/latest/${encodeURIComponent(hostname)}`,
          ),
          axios.get(
            `${API}/api/compliance/latest/${encodeURIComponent(hostname)}`,
          ),
          axios.get(
            `${API}/api/compliance/checks/${encodeURIComponent(hostname)}`,
          ),
          axios.get(`${API}/api/risk/cve/${encodeURIComponent(hostname)}`),
        ]);
        setRiskRes(r.data);
        setPatchRes(p.data);
        setCompRes(c.data);
        setChecksRes(ch.data?.data || []);
        setCveMatches(cve.data?.data || []);
        try {
          const agentsRes = await axios.get(`${API}/api/agents`);
          const found = (agentsRes.data?.data || []).find(
            (a) => (a.hostname || "").toLowerCase() === hostname.toLowerCase(),
          );
          setAgentStatus(found?.status || null);
        } catch {}
      } catch (e) {
        setErr(e?.message || "Failed to load asset details");
      } finally {
        setLoading(false);
      }
    })();
  }, [hostname]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const risk = riskRes?.risk || { score: 0, priority: "Low", reasons: [] };
  const patch = patchRes?.data || null;
  const comp = compRes?.data || null;

  const agentLastSeen =
    checksRes.length > 0
      ? checksRes.reduce(
          (latest, c) => (c.collectedAt > latest ? c.collectedAt : latest),
          checksRes[0].collectedAt,
        )
      : comp?.raw?.agent?.lastKeepAlive || comp?.raw?.agent?.dateAdd || null;

  const osName = comp?.raw?.agent?.os?.name || patch?.os || "-";
  const ipAddr = comp?.raw?.agent?.ip || patch?.raw?.ip || "-";

  const patchList = useMemo(() => {
    if (!patch?.missing) return [];
    return Array.isArray(patch.missing) ? patch.missing : [];
  }, [patch]);

  const countAll = checksRes.length;
  const countFailed = checksRes.filter((x) => x.result === "failed").length;
  const countPassed = checksRes.filter((x) => x.result === "passed").length;
  const countNA = checksRes.filter((x) => x.result === "not applicable").length;

  const scaScore =
    countAll - countNA > 0
      ? Math.round((countPassed / (countAll - countNA)) * 100)
      : null;
  const scaFailedCount = countFailed;
  const scaPolicy = comp?.raw?.summary?.policy || null;

  const filteredChecks = useMemo(() => {
    let list = checksRes;
    if (resultFilter !== "all")
      list = list.filter(
        (x) => (x.result || "").toLowerCase() === resultFilter,
      );
    const q = cisQuery.trim().toLowerCase();
    if (q)
      list = list.filter(
        (x) =>
          String(x.checkId || "")
            .toLowerCase()
            .includes(q) ||
          String(x.title || "")
            .toLowerCase()
            .includes(q) ||
          String(x.rationale || "")
            .toLowerCase()
            .includes(q) ||
          String(x.remediation || "")
            .toLowerCase()
            .includes(q),
      );
    return list;
  }, [checksRes, resultFilter, cisQuery]);

  const pagedChecks = useMemo(() => {
    const start = (cisPage - 1) * pageSize;
    return filteredChecks.slice(start, start + pageSize);
  }, [filteredChecks, cisPage]);

  const totalPages = Math.max(1, Math.ceil(filteredChecks.length / pageSize));
  useEffect(() => {
    setCisPage(1);
  }, [cisQuery, resultFilter]);

   const openTickets = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter(
    (t) => t.status === "in-progress",
  ).length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  const recommendedPlan = useMemo(() => {
    const plan = [];

    // Step 1: urgency framing based on priority + exploit status
    const hasExploits = risk?.breakdown?.hasExploits;
    const exploitIds = risk?.breakdown?.exploitCVEIds || [];
    if (hasExploits) {
      plan.push({
        text: `URGENT: ${exploitIds.length} CVE${exploitIds.length > 1 ? "s" : ""} (${exploitIds.join(", ")}) have known public exploit code. Patch within 24 hours regardless of maintenance schedule.`,
        urgent: true,
      });
    } else if (
      ["critical", "high"].includes((risk.priority || "").toLowerCase())
    ) {
      plan.push({
        text: `Risk priority is ${risk.priority} (score ${risk.score}). Schedule a patch window within 24–48 hours.`,
      });
    } else if ((risk.priority || "").toLowerCase() === "medium") {
      plan.push({
        text: `Risk priority is Medium (score ${risk.score}). Schedule a patch window within 7 days.`,
      });
    } else {
      plan.push({
        text: `Risk priority is Low (score ${risk.score}). Patch in the next regular maintenance cycle.`,
      });
    }

    // Step 2: missing patches, referencing highest-CVSS CVE if known
    if ((patch?.missingCount ?? 0) > 0) {
      if (cveMatches.length > 0) {
        const top = [...cveMatches].sort(
          (a, b) => (b.cvssScore || 0) - (a.cvssScore || 0),
        )[0];
        plan.push({
          text: `${patch.missingCount} update${patch.missingCount > 1 ? "s" : ""} missing. Highest severity: ${top.cveId} (CVSS ${(top.cvssScore || 0).toFixed(1)}, ${top.severity || "Unknown"}) on ${top.patchRef}. Apply this update first via Patch Backlog.`,
        });
      } else {
        plan.push({
          text: `${patch.missingCount} update${patch.missingCount > 1 ? "s" : ""} missing, but no CVE data matched yet. Run CVE enrichment to identify severity.`,
        });
      }
    } else {
      plan.push({
        text: "No missing patch items reported — verify collectors ran recently.",
      });
    }

    // Step 3: compliance failures + ticket status
    if (scaFailedCount > 0) {
      if (openTickets > 0 || inProgressCount > 0) {
        plan.push({
          text: `${scaFailedCount} CIS compliance failure${scaFailedCount > 1 ? "s" : ""}. ${openTickets} open and ${inProgressCount} in-progress ticket${openTickets + inProgressCount > 1 ? "s" : ""} already tracking remediation.`,
        });
      } else {
        plan.push({
          text: `${scaFailedCount} CIS compliance failure${scaFailedCount > 1 ? "s" : ""} with no tickets yet. Go to Compliance tab, filter Failed, and create tickets for the highest-impact checks.`,
        });
      }
    } else {
      plan.push({
        text: "Compliance shows no failures — no remediation tickets needed.",
      });
    }

    // Step 4: verification
    plan.push({
      text: "After applying patches or fixing compliance issues, run a rescan (remediate_and_rescan.sh) or wait for the next scheduled scan, then verify the risk score decreases on this page.",
    });

    return plan;
  }, [
    risk,
    patch?.missingCount,
    scaFailedCount,
    cveMatches,
    openTickets,
    inProgressCount,
  ]);


  const headerRight = (
    <span className={statusBadge(agentStatus)}>
      <span className="badgeDot"></span>
      {agentStatus === "active"
        ? "Online"
        : agentStatus
          ? "Offline"
          : "Unknown"}
    </span>
  );

  return (
    <Layout title={`Asset: ${hostname}`} rightControls={headerRight}>
      {/* Check detail modal */}
      <Modal open={!!selectedCheck} onClose={() => setSelectedCheck(null)}>
        {selectedCheck && (
          <div style={{ padding: 4 }}>
            <div className="modalHeader">
              <div className="title" style={{ fontSize: 20 }}>
                Check {selectedCheck.checkId}
              </div>
              <button
                className="btn"
                style={{
                  background: "transparent",
                  border: "1px solid var(--line)",
                  color: "var(--muted)",
                }}
                onClick={() => setSelectedCheck(null)}
              >
                Close
              </button>
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                  {selectedCheck.title}
                </div>
                <span className={resultBadge(selectedCheck.result)}>
                  {selectedCheck.result}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 24,
                }}
              >
                <div>
                  <div className="cardLabel">Description</div>
                  <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                    {selectedCheck.description || "No description provided."}
                  </div>
                </div>
                <div>
                  <div className="cardLabel">Rationale</div>
                  <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                    {selectedCheck.rationale || "No rationale provided."}
                  </div>
                </div>
              </div>
              <div>
                <div className="cardLabel">Remediation</div>
                <div
                  style={{
                    padding: 24,
                    background: "var(--accent-muted)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--accent-border)",
                    lineHeight: 1.6,
                    color: "#fff",
                    fontWeight: 600,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                  }}
                >
                  {selectedCheck.remediation ||
                    "No remediation steps provided."}
                </div>
              </div>
              {Array.isArray(selectedCheck.command) &&
                selectedCheck.command.length > 0 && (
                  <div>
                    <div className="cardLabel">Verification Command</div>
                    <pre>{selectedCheck.command.join("\n")}</pre>
                  </div>
                )}
            </div>
          </div>
        )}
      </Modal>

      {loading && <div className="muted">Loading...</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      {!loading && !err && (
        <>
          {/* Asset header */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {hostname}
                </div>
                <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
                  <span style={{ color: "var(--accent)" }}>{osName}</span>
                  &nbsp;•&nbsp; IP: {ipAddr}
                  &nbsp;•&nbsp; Last collection:{" "}
                  {agentLastSeen
                    ? new Date(agentLastSeen).toLocaleString()
                    : "-"}
                </div>
              </div>
              <div
                className={badge(risk.priority)}
                style={{
                  borderRadius: "var(--radius-md)",
                  padding: "8px 16px",
                  textAlign: "center",
                  minWidth: 110,
                  display: "inline-flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    opacity: 0.85,
                  }}
                >
                  {risk.priority || "Low"}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {risk.score ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="kpis">
            <div className="card">
              <div className="cardLabel">Risk Score</div>
              <div className="cardValue" style={{ color: "var(--accent)" }}>
                {risk.score ?? 0}
              </div>
            </div>
            <div className="card">
              <div className="cardLabel">Priority</div>
              <div className="cardValue">
                <span className={badge(risk.priority)}>
                  {risk.priority || "Low"}
                </span>
              </div>
            </div>
            <div className="card">
              <div className="cardLabel">Missing Updates</div>
              <div className="cardValue">{patch?.missingCount ?? "-"}</div>
            </div>
            <div className="card">
              <div className="cardLabel">CIS Score</div>
              <div className="cardValue">{scaScore ?? "-"}</div>
            </div>
            <div className="card">
              <div className="cardLabel">CIS Failed</div>
              <div
                className="cardValue"
                style={{
                  color: scaFailedCount > 0 ? "hsl(350,100%,65%)" : "inherit",
                }}
              >
                {scaFailedCount}
              </div>
            </div>
            <div className="card">
              <div className="cardLabel">Open Tickets</div>
              <div
                className="cardValue"
                style={{
                  color: openTickets > 0 ? "hsl(350,100%,65%)" : "inherit",
                }}
              >
                {openTickets}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            <TabButton
              active={tab === "compliance"}
              onClick={() => setTab("compliance")}
            >
              Compliance (CIS)
            </TabButton>
            <TabButton
              active={tab === "tickets"}
              onClick={() => setTab("tickets")}
            >
              Tickets {tickets.length > 0 ? `(${tickets.length})` : ""}
            </TabButton>
            <TabButton active={tab === "patch"} onClick={() => setTab("patch")}>
              Patch Backlog
            </TabButton>
            <TabButton active={tab === "cve"} onClick={() => setTab("cve")}>
              CVE Intelligence{" "}
              {cveMatches.length > 0 ? `(${cveMatches.length})` : ""}
            </TabButton>
            <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>
              Remediation Plan
            </TabButton>
          </div>

          {/* ── Compliance Tab ── */}
          {tab === "compliance" && (
            <div className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                  marginBottom: 24,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    CIS / SCA Compliance Details
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    Policy:{" "}
                    <span style={{ color: "var(--text)" }}>
                      {scaPolicy?.name ||
                        comp?.raw?.sca?.data?.affected_items?.[0]?.name ||
                        "-"}
                    </span>
                  </div>
                </div>
                <input
                  className="input"
                  placeholder="Search check ID, title, or remediation..."
                  value={cisQuery}
                  onChange={(e) => setCisQuery(e.target.value)}
                  style={{ minWidth: 320 }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 20,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { key: "all", label: `All (${countAll})` },
                  { key: "failed", label: `Failed (${countFailed})` },
                  { key: "passed", label: `Passed (${countPassed})` },
                  { key: "not applicable", label: `N/A (${countNA})` },
                ].map((f) => (
                  <button
                    key={f.key}
                    className={`btn-tab ${resultFilter === f.key ? "active" : ""}`}
                    onClick={() => setResultFilter(f.key)}
                    style={{ fontSize: 12, padding: "6px 14px" }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="tableWrap">
                {checksRes.length === 0 ? (
                  <div className="muted" style={{ padding: 20 }}>
                    No compliance data collected for this asset.
                  </div>
                ) : filteredChecks.length === 0 ? (
                  <div className="muted" style={{ padding: 20 }}>
                    No checks match your filter.
                  </div>
                ) : (
                  <>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 90 }}>ID</th>
                          <th>Title</th>
                          <th style={{ width: 130 }}>Result</th>
                          <th style={{ width: 120 }}>Ticket</th>
                          <th style={{ width: 160, textAlign: "center" }}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedChecks.map((c) => {
                          const ticket = ticketMap[c.checkId];
                          return (
                            <tr key={c.checkId}>
                              <td
                                className="mono"
                                style={{ color: "var(--accent)" }}
                              >
                                {c.checkId}
                              </td>
                              <td style={{ fontWeight: 500 }}>{c.title}</td>
                              <td>
                                <span className={resultBadge(c.result)}>
                                  {c.result}
                                </span>
                              </td>
                              <td>
                                <td>
                                  {ticket ? (
                                    <span
                                      onClick={() => navigate("/tickets")}
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: "2px 8px",
                                        borderRadius: 4,
                                        background: `${ticketStatusColor(ticket.status)}18`,
                                        color: ticketStatusColor(ticket.status),
                                        border: `1px solid ${ticketStatusColor(ticket.status)}44`,
                                        cursor: "pointer",
                                        display: "inline-block",
                                      }}
                                    >
                                      {ticketStatusLabel(ticket.status)}
                                    </span>
                                  ) : null}
                                </td>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    justifyContent: "center",
                                  }}
                                >
                                  <button
                                    className="btn"
                                    style={{
                                      padding: "5px 10px",
                                      fontSize: 11,
                                    }}
                                    onClick={() => setSelectedCheck(c)}
                                  >
                                    View
                                  </button>
                                  {c.result === "failed" && !ticket && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          await axios.post(
                                            `${API}/api/tickets`,
                                            {
                                              assetHostname: hostname,
                                              checkId: c.checkId,
                                              title: c.title,
                                              remediation: c.remediation || "",
                                              priority: "Medium",
                                              assignedTo: "",
                                              notes: "",
                                            },
                                          );
                                        } catch {}
                                        navigate("/tickets");
                                      }}
                                      style={{
                                        padding: "5px 10px",
                                        fontSize: 11,
                                        borderRadius: 6,
                                        background: "hsla(210,100%,60%,0.12)",
                                        border:
                                          "1px solid hsla(210,100%,60%,0.3)",
                                        color: "hsl(210,100%,60%)",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                      }}
                                    >
                                      + Ticket
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "16px 20px",
                        borderTop: "1px solid var(--line)",
                      }}
                    >
                      <button
                        className="btn"
                        onClick={() => setCisPage((p) => Math.max(1, p - 1))}
                        disabled={cisPage <= 1}
                      >
                        Previous
                      </button>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Page {cisPage} of {totalPages}
                      </div>
                      <button
                        className="btn"
                        onClick={() =>
                          setCisPage((p) => Math.min(totalPages, p + 1))
                        }
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

          {/* ── Tickets Tab ── */}
          {tab === "tickets" && (
            <div className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  Remediation Tickets
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    {
                      label: `Open`,
                      value: openTickets,
                      color: "hsl(350,100%,65%)",
                    },
                    {
                      label: `In Progress`,
                      value: inProgressCount,
                      color: "hsl(45,100%,50%)",
                    },
                    {
                      label: `Resolved`,
                      value: resolvedCount,
                      color: "hsl(130,60%,50%)",
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "4px 12px",
                        borderRadius: 6,
                        background: `${color}12`,
                        color,
                        border: `1px solid ${color}33`,
                      }}
                    >
                      {value} {label}
                    </div>
                  ))}
                </div>
              </div>

              {tickets.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🎫</div>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    No tickets yet
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    Go to the Compliance tab, filter by Failed, and click "+
                    Ticket" on any failed check to start tracking remediation.
                  </div>
                </div>
              ) : (
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Check</th>
                        <th>Title</th>
                        <th style={{ width: 110 }}>Priority</th>
                        <th style={{ width: 120 }}>Status</th>
                        <th style={{ width: 110 }}>Assigned</th>
                        <th style={{ width: 110 }}>Created</th>
                        <th style={{ width: 80, textAlign: "center" }}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((t) => (
                        <tr key={t._id}>
                          <td
                            className="mono"
                            style={{ color: "var(--accent)", fontSize: 12 }}
                          >
                            {t.checkId}
                          </td>
                          <td style={{ fontSize: 13, fontWeight: 500 }}>
                            {t.title}
                          </td>
                          <td>
                            <span className={badge(t.priority)}>
                              {t.priority}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: `${ticketStatusColor(t.status)}18`,
                                color: ticketStatusColor(t.status),
                                border: `1px solid ${ticketStatusColor(t.status)}44`,
                              }}
                            >
                              {ticketStatusLabel(t.status)}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {t.assignedTo || "—"}
                          </td>
                          <td style={{ fontSize: 12, color: "var(--muted)" }}>
                            {new Date(t.createdAt).toLocaleDateString()}
                          </td>
                          <td style={{ textAlign: "center" }}></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Patch Tab ── */}
          {tab === "patch" && (
            <div className="card">
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
                Patch Backlog
              </div>
              {patchList.length === 0 ? (
                <div className="muted">No missing updates reported.</div>
              ) : (
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Missing Package / Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patchList.map((p, i) => (
                        <tr key={i}>
                          <td className="mono" style={{ fontSize: 13 }}>
                            {p}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Risk Tab ── */}
          {/* ── CVE Intelligence Tab ── */}
          {tab === "cve" && (
            <div className="card">
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>
                CVE Intelligence
              </div>

              {risk?.breakdown?.hasExploits && (
                <div
                  style={{
                    padding: "12px 18px",
                    borderRadius: 8,
                    marginBottom: 20,
                    background: "hsla(350,100%,65%,0.1)",
                    border: "1px solid hsla(350,100%,65%,0.4)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 20 }}>🔥</div>
                  <div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 14,
                        color: "hsl(350,100%,65%)",
                      }}
                    >
                      Active Exploit Alert — {risk.breakdown.exploitCount} CVE
                      {risk.breakdown.exploitCount > 1 ? "s" : ""} have public
                      exploit code
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginTop: 4,
                      }}
                    >
                      Known exploit code exists. Risk score boosted 25%. Patch
                      immediately.
                    </div>
                  </div>
                </div>
              )}

              {cveMatches.length === 0 ? (
                <div className="muted" style={{ padding: 20 }}>
                  No CVE matches found for this asset's missing patches. Run the
                  CVE enrichment collector after new patch data arrives.
                </div>
              ) : (
                <>
                  <div
                    className="muted"
                    style={{ marginBottom: 16, fontSize: 13 }}
                  >
                    {cveMatches.length} CVE{cveMatches.length > 1 ? "s" : ""}{" "}
                    across {new Set(cveMatches.map((c) => c.patchRef)).size}{" "}
                    missing patch
                    {new Set(cveMatches.map((c) => c.patchRef)).size > 1
                      ? "es"
                      : ""}
                    . Highest CVSS:{" "}
                    {Math.max(
                      ...cveMatches.map((c) => c.cvssScore || 0),
                    ).toFixed(1)}
                  </div>

                  {Array.from(
                    cveMatches.reduce((map, c) => {
                      const key = c.patchRef || "unknown";
                      if (!map.has(key))
                        map.set(key, { patchTitle: c.patchTitle, items: [] });
                      map.get(key).items.push(c);
                      return map;
                    }, new Map()),
                  )
                    .sort((a, b) => {
                      const maxA = Math.max(
                        ...a[1].items.map((c) => c.cvssScore || 0),
                      );
                      const maxB = Math.max(
                        ...b[1].items.map((c) => c.cvssScore || 0),
                      );
                      return maxB - maxA;
                    })
                    .map(([patchRef, group]) => {
                      const maxCvss = Math.max(
                        ...group.items.map((c) => c.cvssScore || 0),
                      );
                      const isOpen = expandedPkg === patchRef;
                      return (
                        <div
                          key={patchRef}
                          style={{
                            border: "1px solid var(--line)",
                            borderRadius: "var(--radius-md)",
                            marginBottom: 10,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            onClick={() =>
                              setExpandedPkg(isOpen ? null : patchRef)
                            }
                            style={{
                              padding: "12px 16px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              cursor: "pointer",
                              background: "var(--panel)",
                            }}
                          >
                            <div>
                              <div
                                className="mono"
                                style={{
                                  fontWeight: 700,
                                  fontSize: 13,
                                  color: "var(--accent)",
                                }}
                              >
                                {patchRef}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--muted)",
                                  marginTop: 2,
                                }}
                              >
                                {group.patchTitle || patchRef}
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <span
                                className={resultBadge(
                                  maxCvss >= 7
                                    ? "failed"
                                    : maxCvss >= 4
                                      ? "not applicable"
                                      : "passed",
                                )}
                              >
                                Max CVSS {maxCvss.toFixed(1)}
                              </span>
                              <span
                                style={{ fontSize: 12, color: "var(--muted)" }}
                              >
                                {group.items.length} CVE
                                {group.items.length > 1 ? "s" : ""}
                              </span>
                              <span style={{ fontSize: 12 }}>
                                {isOpen ? "▲" : "▼"}
                              </span>
                            </div>
                          </div>

                          {isOpen && (
                            <div className="tableWrap">
                              <table>
                                <thead>
                                  <tr>
                                    <th style={{ width: 160 }}>CVE ID</th>
                                    <th style={{ width: 100 }}>CVSS</th>
                                    <th style={{ width: 110 }}>Severity</th>
                                    <th style={{ width: 130 }}>Exploit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.items
                                    .sort(
                                      (a, b) =>
                                        (b.cvssScore || 0) - (a.cvssScore || 0),
                                    )
                                    .map((c) => (
                                      <tr key={c.cveId}>
                                        <td
                                          className="mono"
                                          style={{
                                            fontSize: 12,
                                            color: "var(--accent)",
                                          }}
                                        >
                                          {c.cveId}
                                        </td>
                                        <td
                                          style={{
                                            fontSize: 13,
                                            fontWeight: 700,
                                          }}
                                        >
                                          {(c.cvssScore ?? 0).toFixed(1)}
                                        </td>
                                        <td>
                                          <span
                                            className={resultBadge(
                                              (
                                                c.severity || ""
                                              ).toLowerCase() === "critical" ||
                                                (
                                                  c.severity || ""
                                                ).toLowerCase() === "high"
                                                ? "failed"
                                                : (
                                                      c.severity || ""
                                                    ).toLowerCase() === "medium"
                                                  ? "not applicable"
                                                  : "passed",
                                            )}
                                          >
                                            {c.severity || "Unknown"}
                                          </span>
                                        </td>
                                        <td>
                                          {c.hasExploit ? (
                                            <span
                                              style={{
                                                color: "hsl(350,100%,65%)",
                                                fontWeight: 700,
                                                fontSize: 12,
                                              }}
                                            >
                                              🔥 Known exploit
                                            </span>
                                          ) : (
                                            <span
                                              style={{
                                                color: "var(--muted)",
                                                fontSize: 12,
                                              }}
                                            >
                                              No known exploit
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </>
              )}
            </div>
          )}

          {/* ── Plan Tab ── */}
          {tab === "plan" && (
            <div className="card">
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>
                Recommended Action Plan
              </div>
              <div className="tableWrap" style={{ padding: 24 }}>
                <div style={{ display: "grid", gap: 16 }}>
                  {recommendedPlan.map((x, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 16,
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: x.urgent
                            ? "hsla(350,100%,65%,0.15)"
                            : "var(--accent-muted)",
                          color: x.urgent
                            ? "hsl(350,100%,65%)"
                            : "var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {x.urgent ? "🔥" : i + 1}
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          lineHeight: 1.6,
                          color: x.urgent ? "hsl(350,100%,65%)" : "inherit",
                          fontWeight: x.urgent ? 700 : 400,
                        }}
                      >
                        {x.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
