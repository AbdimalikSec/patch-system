import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import Layout from "../Layout";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const ALL_ASSETS = ["DC1", "HQ-staff-01", "kali"];

function priorityColor(p) {
  return { Critical: "hsl(350,100%,65%)", High: "hsl(25,100%,60%)", Medium: "hsl(45,100%,50%)", Low: "hsl(130,60%,50%)" }[p] || "var(--muted)";
}
function statusColor(s) {
  return { open: "hsl(350,100%,65%)", "in-progress": "hsl(45,100%,50%)", resolved: "hsl(130,60%,50%)" }[s] || "var(--muted)";
}
function statusLabel(s) {
  return { open: "Open", "in-progress": "In Progress", resolved: "Resolved" }[s] || s;
}

function Badge({ color, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
      background: `${color}18`, color, border: `1px solid ${color}44`,
    }}>{children}</span>
  );
}

// ── Create Ticket Panel ───────────────────────────────────────────────────────
function CreateTicketPanel({ users, onCreated, onCancel }) {
  const [asset, setAsset]         = useState(ALL_ASSETS[0]);
  const [checks, setChecks]       = useState([]);
  const [checkSearch, setCheckSearch] = useState("");
  const [selectedCheck, setSelectedCheck] = useState(null);
  const [priority, setPriority]   = useState("Medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes]         = useState("");
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState("");

  // Load failed checks for selected asset
  useEffect(() => {
    if (!asset) return;
    setLoadingChecks(true);
    setSelectedCheck(null);
    setCheckSearch("");
    axios.get(`${API}/api/compliance/checks/${encodeURIComponent(asset)}/failed`)
      .then(res => setChecks(res.data?.data || []))
      .catch(() => setChecks([]))
      .finally(() => setLoadingChecks(false));
  }, [asset]);

  const filteredChecks = checks.filter(c => {
    const q = checkSearch.toLowerCase();
    return !q || c.checkId.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
  });

  async function handleCreate() {
    if (!selectedCheck) { setErr("Select a failed check first"); return; }
    setSaving(true);
    setErr("");
    try {
      await axios.post(`${API}/api/tickets`, {
        assetHostname: asset,
        checkId:       selectedCheck.checkId,
        title:         selectedCheck.title,
        remediation:   selectedCheck.remediation || "",
        priority,
        assignedTo,
        notes,
      });
      onCreated();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to create ticket");
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderColor: "var(--accent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Create Remediation Ticket</div>
        <button onClick={onCancel} style={{
          background: "transparent", border: "1px solid var(--line)",
          borderRadius: 6, padding: "5px 12px", cursor: "pointer", color: "var(--muted)", fontSize: 12,
        }}>✕ Cancel</button>
      </div>

      {/* Step 1 — pick asset */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Step 1 — Select Asset
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {ALL_ASSETS.map(a => (
            <button key={a} onClick={() => setAsset(a)} style={{
              padding: "7px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: "pointer",
              background: asset === a ? "var(--accent)" : "var(--surface)",
              border: `1px solid ${asset === a ? "var(--accent)" : "var(--line)"}`,
              color: asset === a ? "#000" : "var(--text)",
            }}>{a}</button>
          ))}
        </div>
      </div>

      {/* Step 2 — pick failed check */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Step 2 — Select Failed Check {checks.length > 0 && <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none" }}>({checks.length} failed)</span>}
        </div>
        <input
          className="input"
          placeholder="Search by check ID or title..."
          value={checkSearch}
          onChange={e => { setCheckSearch(e.target.value); setSelectedCheck(null); }}
          style={{ width: "100%", marginBottom: 8, boxSizing: "border-box" }}
        />
        {loadingChecks && <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>Loading failed checks...</div>}
        {!loadingChecks && filteredChecks.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>
            {checks.length === 0 ? "No failed checks found for this asset." : "No checks match your search."}
          </div>
        )}
        {!loadingChecks && filteredChecks.length > 0 && (
          <div style={{
            maxHeight: 200, overflowY: "auto", border: "1px solid var(--line)",
            borderRadius: 8, background: "var(--surface)",
          }}>
            {filteredChecks.slice(0, 50).map(c => (
              <div
                key={c.checkId}
                onClick={() => setSelectedCheck(c)}
                style={{
                  padding: "10px 14px", cursor: "pointer",
                  borderBottom: "1px solid var(--line)",
                  background: selectedCheck?.checkId === c.checkId ? "var(--accent-muted)" : "transparent",
                  borderLeft: selectedCheck?.checkId === c.checkId ? "3px solid var(--accent)" : "3px solid transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (selectedCheck?.checkId !== c.checkId) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (selectedCheck?.checkId !== c.checkId) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0 }}>{c.checkId}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                </div>
              </div>
            ))}
            {filteredChecks.length > 50 && (
              <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--muted)" }}>
                Showing 50 of {filteredChecks.length} — narrow your search
              </div>
            )}
          </div>
        )}
        {selectedCheck && (
          <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 6, background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>SELECTED CHECK — REMEDIATION</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>{selectedCheck.remediation || "No remediation steps recorded."}</div>
          </div>
        )}
      </div>

      {/* Step 3 — priority, assignee, notes */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Step 3 — Details
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Priority</div>
            <select className="input" value={priority} onChange={e => setPriority(e.target.value)}
              style={{ width: "100%", color: priorityColor(priority), fontWeight: 700 }}>
              {["Critical", "High", "Medium", "Low"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Assign To <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional — leave blank for self-assign)</span></div>
            <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              style={{ width: "100%" }}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u._id} value={u.username}>{u.username} ({u.role})</option>)}
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>Notes (optional)</div>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Context, deadline, or observations..."
              style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
      </div>

      {err && (
        <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 12, background: "hsla(350,100%,65%,0.1)", border: "1px solid hsla(350,100%,65%,0.3)", color: "hsl(350,100%,65%)", fontSize: 13 }}>
          {err}
        </div>
      )}

      <button onClick={handleCreate} disabled={saving || !selectedCheck} style={{
        width: "100%", padding: "10px", borderRadius: 8, fontSize: 14, fontWeight: 700,
        background: selectedCheck ? "var(--accent)" : "var(--surface)",
        border: "1px solid var(--line)",
        color: selectedCheck ? "#000" : "var(--muted)",
        cursor: selectedCheck ? "pointer" : "default",
        opacity: saving ? 0.7 : 1,
      }}>{saving ? "Creating..." : "Create Ticket"}</button>
    </div>
  );
}

// ── Ticket Row ────────────────────────────────────────────────────────────────
function TicketRow({ ticket, currentUser, users, onUpdated, onDeleted }) {
  const [editing, setEditing]   = useState(false);
  const [status, setStatus]     = useState(ticket.status);
  const [assigned, setAssigned] = useState(ticket.assignedTo || "");
  const [notes, setNotes]       = useState(ticket.notes || "");
  const [saving, setSaving]     = useState(false);

  const isUnassigned = !ticket.assignedTo;
  const isMyTicket   = ticket.assignedTo === currentUser?.username;

  async function handleSelfAssign() {
    try {
      await axios.patch(`${API}/api/tickets/${ticket._id}`, {
        assignedTo: currentUser.username,
        status: ticket.status === "open" ? "in-progress" : ticket.status,
      });
      onUpdated();
    } catch {}
  }

  async function handleSave() {
    setSaving(true);
    try {
      await axios.patch(`${API}/api/tickets/${ticket._id}`, { status, assignedTo: assigned, notes });
      onUpdated();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ticket for check ${ticket.checkId}?`)) return;
    await axios.delete(`${API}/api/tickets/${ticket._id}`);
    onDeleted();
  }

  const sc = statusColor(ticket.status);
  const pc = priorityColor(ticket.priority);

  return (
    <>
      <tr style={{ borderLeft: `3px solid ${isMyTicket ? "var(--accent)" : isUnassigned ? "hsl(45,100%,50%)" : "transparent"}` }}>
        <td><span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>{ticket.checkId}</span></td>
        <td>
          <Link to={`/asset/${encodeURIComponent(ticket.assetHostname)}`}
            style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}>
            {ticket.assetHostname}
          </Link>
        </td>
        <td style={{ fontSize: 12, maxWidth: 260 }}>
          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.title}</div>
          {ticket.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.notes}</div>}
        </td>
        <td><Badge color={pc}>{ticket.priority}</Badge></td>
        <td><Badge color={sc}>{statusLabel(ticket.status)}</Badge></td>
        <td style={{ fontSize: 12 }}>
          {isUnassigned ? (
            <button onClick={handleSelfAssign} style={{
              padding: "3px 10px", borderRadius: 5, fontSize: 11, cursor: "pointer",
              background: "hsla(45,100%,50%,0.12)", border: "1px solid hsla(45,100%,50%,0.4)",
              color: "hsl(45,100%,50%)", fontWeight: 700,
            }}>Assign to me</button>
          ) : (
            <span style={{ color: isMyTicket ? "var(--accent)" : "var(--text)", fontWeight: isMyTicket ? 700 : 400 }}>
              {ticket.assignedTo} {isMyTicket && <span style={{ fontSize: 10, color: "var(--muted)" }}>(you)</span>}
            </span>
          )}
        </td>
        <td style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(ticket.createdAt).toLocaleDateString()}</td>
        <td style={{ fontSize: 11, color: ticket.resolvedAt ? "hsl(130,60%,50%)" : "var(--muted)" }}>
          {ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleDateString() : "—"}
        </td>
        <td>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(e => !e)} style={{
              padding: "4px 10px", borderRadius: 5, fontSize: 11, cursor: "pointer",
              background: editing ? "var(--accent)" : "var(--surface)",
              border: "1px solid var(--line)",
              color: editing ? "#000" : "var(--muted)", fontWeight: 600,
            }}>{editing ? "▲" : "Edit"}</button>
            <button onClick={handleDelete} style={{
              padding: "4px 8px", borderRadius: 5, fontSize: 11, cursor: "pointer",
              background: "transparent", border: "1px solid hsla(350,100%,65%,0.3)",
              color: "hsl(350,100%,65%)",
            }}>✕</button>
          </div>
        </td>
      </tr>

      {editing && (
        <tr style={{ background: "var(--surface)" }}>
          <td colSpan={9} style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Status</div>
                <select className="input" value={status} onChange={e => setStatus(e.target.value)}
                  style={{ fontSize: 12, color: statusColor(status), fontWeight: 700, padding: "6px 10px" }}>
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Assigned To</div>
                <select className="input" value={assigned} onChange={e => setAssigned(e.target.value)}
                  style={{ fontSize: 12, padding: "6px 10px" }}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u._id} value={u.username}>{u.username} ({u.role})</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Notes</div>
                <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes..." style={{ width: "100%", fontSize: 12, padding: "6px 10px" }} />
              </div>
              <button onClick={handleSave} disabled={saving} style={{
                padding: "7px 18px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                background: "var(--accent)", border: "none", color: "#000", cursor: "pointer",
                opacity: saving ? 0.7 : 1,
              }}>{saving ? "Saving..." : "Save"}</button>
              <button onClick={() => setEditing(false)} style={{
                padding: "7px 12px", borderRadius: 6, fontSize: 12,
                background: "transparent", border: "1px solid var(--line)",
                color: "var(--muted)", cursor: "pointer",
              }}>Cancel</button>
            </div>
            {ticket.remediation && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--accent-muted)", borderRadius: 6, border: "1px solid var(--accent-border)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Remediation Steps</div>
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>{ticket.remediation}</div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Tickets() {
  const { user: currentUser } = useAuth();
  const [tickets, setTickets]   = useState([]);
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [assetFilter, setAssetFilter]   = useState("all");
  const [assignFilter, setAssignFilter] = useState("all");
  const [search, setSearch]     = useState("");
  const [toast, setToast]       = useState(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketRes, userRes] = await Promise.all([
        axios.get(`${API}/api/tickets`),
        axios.get(`${API}/api/auth/users`),
      ]);
      setTickets(ticketRes.data?.data || []);
      const allUsers = userRes.data?.data || [];
      setUsers(allUsers.filter(u => u.role === "analyst" || u.role === "admin"));
    } catch {
      showToast("err", "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreated() {
    showToast("ok", "Ticket created");
    setShowCreate(false);
    load();
  }

  const assets = [...new Set(tickets.map(t => t.assetHostname))].sort();

  const filtered = tickets.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (assetFilter !== "all" && t.assetHostname !== assetFilter) return false;
    if (assignFilter === "mine" && t.assignedTo !== currentUser?.username) return false;
    if (assignFilter === "unassigned" && t.assignedTo) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) &&
          !t.checkId.toLowerCase().includes(q) &&
          !t.assetHostname.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total         = tickets.length;
  const openCount     = tickets.filter(t => t.status === "open").length;
  const inProgCount   = tickets.filter(t => t.status === "in-progress").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved").length;
  const unassigned    = tickets.filter(t => !t.assignedTo).length;
  const myTickets     = tickets.filter(t => t.assignedTo === currentUser?.username).length;

  const canCreate = currentUser?.role === "admin" || currentUser?.role === "analyst";

  return (
    <Layout title="Remediation Tickets">

      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: toast.type === "ok" ? "hsla(130,60%,50%,0.15)" : "hsla(350,100%,65%,0.15)",
          border: `1px solid ${toast.type === "ok" ? "hsl(130,60%,50%)" : "hsl(350,100%,65%)"}`,
          color: toast.type === "ok" ? "hsl(130,60%,50%)" : "hsl(350,100%,65%)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}>
          {toast.type === "ok" ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Total",       value: total,         color: "var(--text)" },
            { label: "Open",        value: openCount,     color: "hsl(350,100%,65%)" },
            { label: "In Progress", value: inProgCount,   color: "hsl(45,100%,50%)" },
            { label: "Resolved",    value: resolvedCount, color: "hsl(130,60%,50%)" },
            { label: "Unassigned",  value: unassigned,    color: unassigned > 0 ? "hsl(45,100%,50%)" : "var(--muted)" },
            { label: "Mine",        value: myTickets,     color: myTickets > 0 ? "var(--accent)" : "var(--muted)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: "10px 16px", minWidth: 80 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
            </div>
          ))}
          {/* Resolution bar */}
          <div className="card" style={{ padding: "10px 16px", minWidth: 160 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Resolution Rate</div>
            <div style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden", marginBottom: 5 }}>
              <div style={{
                height: "100%", borderRadius: 3,
                width: total > 0 ? `${Math.round((resolvedCount / total) * 100)}%` : "0%",
                background: "hsl(130,60%,50%)", transition: "width 0.6s ease",
              }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "hsl(130,60%,50%)" }}>
              {total > 0 ? Math.round((resolvedCount / total) * 100) : 0}%
            </div>
          </div>
        </div>

        {canCreate && (
          <button onClick={() => setShowCreate(s => !s)} style={{
            padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: showCreate ? "var(--surface)" : "var(--accent)",
            border: showCreate ? "1px solid var(--line)" : "none",
            color: showCreate ? "var(--muted)" : "#000", cursor: "pointer", flexShrink: 0,
          }}>{showCreate ? "✕ Cancel" : "+ Create Ticket"}</button>
        )}
      </div>

      {/* Create panel */}
      {showCreate && (
        <CreateTicketPanel
          users={users}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" placeholder="Search title, check ID, or asset..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 2, minWidth: 160, fontSize: 13 }} />
          <div style={{ display: "flex", gap: 4 }}>
            {["all", "open", "in-progress", "resolved"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`btn-tab ${statusFilter === s ? "active" : ""}`}
                style={{ fontSize: 11, padding: "5px 10px" }}>
                {s === "all" ? "All" : statusLabel(s)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[{ key: "all", label: "Everyone" }, { key: "mine", label: "Mine" }, { key: "unassigned", label: "Unassigned" }].map(f => (
              <button key={f.key} onClick={() => setAssignFilter(f.key)}
                className={`btn-tab ${assignFilter === f.key ? "active" : ""}`}
                style={{ fontSize: 11, padding: "5px 10px" }}>
                {f.label}
              </button>
            ))}
          </div>
          <select className="input" value={assetFilter} onChange={e => setAssetFilter(e.target.value)}
            style={{ fontSize: 12, padding: "6px 10px", minWidth: 120 }}>
            <option value="all">All Assets</option>
            {assets.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Loading tickets...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎫</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
              {tickets.length === 0 ? "No tickets yet" : "No tickets match your filters"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 400, margin: "0 auto" }}>
              {tickets.length === 0 && canCreate
                ? "Click \"+ Create Ticket\" to start tracking a failed compliance check."
                : "Try adjusting your filters."}
            </div>
          </div>
        ) : (
          <div className="tableWrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 85 }}>Check</th>
                  <th style={{ width: 100 }}>Asset</th>
                  <th>Title</th>
                  <th style={{ width: 95 }}>Priority</th>
                  <th style={{ width: 105 }}>Status</th>
                  <th style={{ width: 140 }}>Assigned To</th>
                  <th style={{ width: 88 }}>Created</th>
                  <th style={{ width: 88 }}>Resolved</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ticket => (
                  <TicketRow
                    key={ticket._id}
                    ticket={ticket}
                    currentUser={currentUser}
                    users={users}
                    onUpdated={load}
                    onDeleted={load}
                  />
                ))}
              </tbody>
            </table>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--muted)" }}>
              Showing {filtered.length} of {total} ticket{total !== 1 ? "s" : ""}
              {unassigned > 0 && (
                <span style={{ marginLeft: 12, color: "hsl(45,100%,50%)", fontWeight: 600 }}>
                  ⚠ {unassigned} unassigned — click "Assign to me" to take ownership
                </span>
              )}
            </div>
          </div>
        )}
      </div>

    </Layout>
  );
}