import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import Layout from "../Layout";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function priorityColor(p) {
  return { Critical: "hsl(350,100%,65%)", High: "hsl(25,100%,60%)", Medium: "hsl(45,100%,50%)", Low: "hsl(130,60%,50%)" }[p] || "var(--muted)";
}
function statusColor(s) {
  return { open: "hsl(350,100%,65%)", "in-progress": "hsl(45,100%,50%)", resolved: "hsl(130,60%,50%)" }[s] || "var(--muted)";
}
function statusLabel(s) {
  return { open: "Open", "in-progress": "In Progress", resolved: "Resolved" }[s] || s;
}
function ageInDays(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}
function ageColor(days) {
  if (days >= 30) return "hsl(350,100%,65%)"; // critical
  if (days >= 14) return "hsl(25,100%,60%)";  // stale
  if (days >= 7) return "hsl(45,100%,50%)";   // aging
  return "var(--muted)";                       // fresh
}

function Badge({ color, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
      background: `${color}18`, color, border: `1px solid ${color}44`,
    }}>{children}</span>
  );
}

function CreateTicketPanel({ users, assets, onCreated, onCancel }) {
  const [asset, setAsset]         = useState(assets[0] || "");
  const [checks, setChecks]       = useState([]);
  const [checkSearch, setCheckSearch] = useState("");
  const [selectedCheckIds, setSelectedCheckIds] = useState([]); // multi-select
  const [priority, setPriority]   = useState("Medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes]         = useState("");
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState("");
  const [progress, setProgress]   = useState(null); // { done, total } while creating

  useEffect(() => {
    if (!asset && assets.length > 0) setAsset(assets[0]);
  }, [assets, asset]);

  useEffect(() => {
    if (!asset) return;
    setLoadingChecks(true);
    setSelectedCheckIds([]);
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

  function toggleCheck(checkId) {
    setSelectedCheckIds(prev =>
      prev.includes(checkId) ? prev.filter(id => id !== checkId) : [...prev, checkId],
    );
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filteredChecks.map(c => c.checkId);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedCheckIds.includes(id));
    if (allSelected) {
      setSelectedCheckIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedCheckIds(prev => [...new Set([...prev, ...filteredIds])]);
    }
  }

  async function handleCreate() {
    if (selectedCheckIds.length === 0) {
      setErr("Select at least one failed check first");
      return;
    }
    setSaving(true);
    setErr("");
    setProgress({ done: 0, total: selectedCheckIds.length });

    const selected = checks.filter(c => selectedCheckIds.includes(c.checkId));
    let failures = 0;

    for (let i = 0; i < selected.length; i++) {
      const c = selected[i];
      try {
        await axios.post(`${API}/api/tickets`, {
          assetHostname: asset,
          checkId:       c.checkId,
          title:         c.title,
          remediation:   c.remediation || "",
          priority,
          assignedTo,
          notes,
        });
      } catch (e) {
        failures++;
      }
      setProgress({ done: i + 1, total: selected.length });
    }

    setSaving(false);
    setProgress(null);

    if (failures > 0 && failures === selected.length) {
      setErr(`Failed to create any tickets (${failures} already existed or errored).`);
      return;
    }
    if (failures > 0) {
      setErr(`Created ${selected.length - failures} of ${selected.length} tickets. ${failures} skipped (likely already had a ticket).`);
    }
    onCreated();
  }

  const allFilteredSelected =
    filteredChecks.length > 0 && filteredChecks.every(c => selectedCheckIds.includes(c.checkId));

  return (
    <div className="card" style={{ marginBottom: 20, borderColor: "var(--accent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Create Remediation Ticket(s)</div>
        <button onClick={onCancel} style={{
          background: "transparent", border: "1px solid var(--line)",
          borderRadius: 6, padding: "5px 12px", cursor: "pointer", color: "var(--muted)", fontSize: 12,
        }}>✕ Cancel</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Step 1 — Select Asset {assets.length === 0 && <span style={{ color: "hsl(45,100%,50%)", fontWeight: 400, textTransform: "none" }}>(loading assets...)</span>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {assets.map(a => (
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

      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
          letterSpacing: "0.05em", marginBottom: 8,
        }}>
          <span>
            Step 2 — Select Failed Checks {checks.length > 0 && <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none" }}>({checks.length} failed)</span>}
          </span>
          {selectedCheckIds.length > 0 && (
            <span style={{
              color: "var(--accent)", fontWeight: 700, textTransform: "none",
              fontSize: 12, background: "var(--accent-muted)", padding: "2px 10px", borderRadius: 12,
            }}>
              {selectedCheckIds.length} selected
            </span>
          )}
        </div>
        <input
          className="input"
          placeholder="Search by check ID or title..."
          value={checkSearch}
          onChange={e => setCheckSearch(e.target.value)}
          style={{ width: "100%", marginBottom: 8, boxSizing: "border-box" }}
        />
        {loadingChecks && <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>Loading failed checks...</div>}
        {!loadingChecks && filteredChecks.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>
            {checks.length === 0 ? "No failed checks found for this asset." : "No checks match your search."}
          </div>
        )}
        {!loadingChecks && filteredChecks.length > 0 && (
          <>
            <div
              onClick={toggleSelectAllFiltered}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 4px",
                cursor: "pointer", fontSize: 12, color: "var(--muted)", fontWeight: 600,
              }}
            >
              <input type="checkbox" checked={allFilteredSelected} onChange={() => {}} style={{ cursor: "pointer" }} />
              {allFilteredSelected ? "Deselect all" : `Select all (${filteredChecks.length})`}
            </div>
            <div style={{
              maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)",
              borderRadius: 8, background: "var(--surface)",
            }}>
              {filteredChecks.slice(0, 100).map(c => {
                const isSelected = selectedCheckIds.includes(c.checkId);
                return (
                  <div
                    key={c.checkId}
                    onClick={() => toggleCheck(c.checkId)}
                    style={{
                      padding: "10px 14px", cursor: "pointer",
                      borderBottom: "1px solid var(--line)",
                      background: isSelected ? "var(--accent-muted)" : "transparent",
                      borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                      display: "flex", alignItems: "center", gap: 10,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: "pointer", flexShrink: 0 }} />
                    <span className="mono" style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0 }}>{c.checkId}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                  </div>
                );
              })}
            </div>
            {filteredChecks.length > 100 && (
              <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--muted)" }}>
                Showing 100 of {filteredChecks.length} — narrow your search to select more precisely
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Step 3 — Details (applied to all selected checks)
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
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>
              Assign To {users.length === 0 && <span style={{ color: "hsl(45,100%,50%)", fontWeight: 400 }}>(no assignable users found)</span>}
            </div>
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

      {progress && (
        <div style={{ marginBottom: 12, fontSize: 12, color: "var(--muted)" }}>
          Creating tickets... {progress.done} / {progress.total}
        </div>
      )}

      <button onClick={handleCreate} disabled={saving || selectedCheckIds.length === 0} style={{
        width: "100%", padding: "10px", borderRadius: 8, fontSize: 14, fontWeight: 700,
        background: selectedCheckIds.length > 0 ? "var(--accent)" : "var(--surface)",
        border: "1px solid var(--line)",
        color: selectedCheckIds.length > 0 ? "#000" : "var(--muted)",
        cursor: selectedCheckIds.length > 0 ? "pointer" : "default",
        opacity: saving ? 0.7 : 1,
      }}>
        {saving
          ? `Creating... (${progress?.done ?? 0}/${progress?.total ?? 0})`
          : selectedCheckIds.length > 0
            ? `Create ${selectedCheckIds.length} Ticket${selectedCheckIds.length !== 1 ? "s" : ""}`
            : "Select checks to create tickets"}
      </button>
    </div>
  );
}

function TicketRow({ ticket, currentUser, users, selected, onToggleSelect, canBulkAssign, onUpdated, onDeleted }) {
  const [editing, setEditing]   = useState(false);
  const [status, setStatus]     = useState(ticket.status);
  const [assigned, setAssigned] = useState(ticket.assignedTo || "");
  const [notes, setNotes]       = useState(ticket.notes || "");
  const [saving, setSaving]     = useState(false);

  const isUnassigned = !ticket.assignedTo;
  const isMyTicket   = ticket.assignedTo === currentUser?.username;
  const isResolved   = ticket.status === "resolved";

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
        {canBulkAssign && (
          <td style={{ width: 34, textAlign: "center" }}>
            {!isResolved && (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(ticket._id)}
                style={{ cursor: "pointer" }}
              />
            )}
          </td>
        )}
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
        <td style={{ fontSize: 12, fontWeight: 700, color: isResolved ? "var(--muted)" : ageColor(ageInDays(ticket.createdAt)) }}>
          {isResolved ? "—" : `${ageInDays(ticket.createdAt)}d`}
        </td>
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
          <td colSpan={canBulkAssign ? 11 : 10} style={{ padding: "16px 20px" }}>
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

export default function Tickets() {
  const { user: currentUser } = useAuth();
  const [tickets, setTickets]   = useState([]);
  const [allAssets, setAllAssets] = useState([]);
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [assetFilter, setAssetFilter]   = useState("all");
  const [assignFilter, setAssignFilter] = useState("all");
  const [search, setSearch]     = useState("");
  const [sortBy, setSortBy]     = useState("oldest"); // default: surface oldest/most urgent first
  const [toast, setToast]       = useState(null);


  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAssignTo, setBulkAssignTo] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkStatusChanging, setBulkStatusChanging] = useState(false);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketRes, assetRes] = await Promise.all([
        axios.get(`${API}/api/tickets`),
        axios.get(`${API}/api/assets/overview`),
      ]);
      setTickets(ticketRes.data?.data || []);
      setAllAssets((assetRes.data?.data || []).map((a) => a.hostname));

      // Only admin/compliance-officer can assign tickets, and only they have
      // access to /api/auth/users on the backend — so only fetch it for them.
      // A failure here should never take down the tickets/assets that already
      // loaded successfully.
      const canAssign =
        currentUser?.role === "admin" || currentUser?.role === "compliance-officer";
      if (canAssign) {
        try {
          const userRes = await axios.get(`${API}/api/auth/users`);
          const allUsers = userRes.data?.data || [];
          setUsers(
            allUsers.filter((u) =>
              ["admin", "compliance-officer", "analyst"].includes(u.role),
            ),
          );
        } catch {
          setUsers([]);
        }
      }
    } catch {
      showToast("err", "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  function handleCreated() {
    showToast("ok", "Ticket created");
    setShowCreate(false);
    load();
  }

  const assets = [...new Set(tickets.map(t => t.assetHostname))].sort();

  const filtered = tickets
    .filter(t => {
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
    })
    .sort((a, b) => {
      const diff = new Date(a.createdAt) - new Date(b.createdAt);
      return sortBy === "oldest" ? diff : -diff;
    });

  const total         = tickets.length;
  const openCount     = tickets.filter(t => t.status === "open").length;
  const inProgCount   = tickets.filter(t => t.status === "in-progress").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved").length;
  const unassigned    = tickets.filter(t => !t.assignedTo).length;
  const myTickets     = tickets.filter(t => t.assignedTo === currentUser?.username).length;

  const canCreate = currentUser?.role === "admin" || currentUser?.role === "compliance-officer";
  const canBulkAssign = currentUser?.role === "admin" || currentUser?.role === "compliance-officer";

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => filtered.some(t => t._id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, assetFilter, assignFilter, search]);

  function toggleSelect(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    const selectable = filtered.filter(t => t.status !== "resolved");
    if (selectedIds.length === selectable.length && selectable.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectable.map(t => t._id));
    }
  }

  async function handleBulkAssign() {
    if (selectedIds.length === 0 || !bulkAssignTo) return;
    setBulkAssigning(true);
    try {
      const res = await axios.patch(`${API}/api/tickets/bulk-assign`, {
        ticketIds: selectedIds,
        assignedTo: bulkAssignTo,
      });
      showToast(
        "ok",
        `Assigned ${res.data?.modified ?? selectedIds.length} ticket${selectedIds.length !== 1 ? "s" : ""} to ${bulkAssignTo}`,
      );
      setSelectedIds([]);
      setBulkAssignTo("");
      load();
    } catch (e) {
      showToast("err", e?.response?.data?.error || "Bulk assign failed");
    } finally {
      setBulkAssigning(false);
    }
  }

   async function handleBulkStatus(status) {
    if (selectedIds.length === 0) return;
    setBulkStatusChanging(true);
    try {
      const res = await axios.patch(`${API}/api/tickets/bulk-status`, {
        ticketIds: selectedIds,
        status,
      });
      showToast(
        "ok",
        `Marked ${res.data?.modified ?? selectedIds.length} ticket${selectedIds.length !== 1 ? "s" : ""} as ${statusLabel(status)}`,
      );
      setSelectedIds([]);
      load();
    } catch (e) {
      showToast("err", e?.response?.data?.error || "Bulk status change failed");
    } finally {
      setBulkStatusChanging(false);
    }
  }

  const selectableCount = filtered.filter(t => t.status !== "resolved").length;
  const allSelected = selectableCount > 0 && selectedIds.length === selectableCount;

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

      {showCreate && (
        <CreateTicketPanel
          users={users}
          assets={allAssets}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

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
          <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ fontSize: 12, padding: "6px 10px", minWidth: 130 }}>
            <option value="oldest">Sort: Oldest first</option>
            <option value="newest">Sort: Newest first</option>
          </select>
        </div>
      </div>
   
      {canBulkAssign && selectedIds.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            borderColor: "var(--accent)",
            background: "var(--accent-muted)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {selectedIds.length} ticket{selectedIds.length !== 1 ? "s" : ""} selected
          </div>

          {/* Bulk assign */}
          <select
            className="input"
            value={bulkAssignTo}
            onChange={e => setBulkAssignTo(e.target.value)}
            style={{ fontSize: 12, padding: "6px 10px", minWidth: 200 }}
          >
            <option value="">Assign to...</option>
            {currentUser?.username && (
              <option value={currentUser.username}>{currentUser.username} (me)</option>
            )}
            {users
              .filter(u => u.username !== currentUser?.username)
              .map(u => (
                <option key={u._id} value={u.username}>
                  {u.username} ({u.role})
                </option>
              ))}
          </select>
          <button
            onClick={handleBulkAssign}
            disabled={!bulkAssignTo || bulkAssigning}
            style={{
              padding: "7px 18px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              background: bulkAssignTo ? "var(--accent)" : "var(--surface)",
              border: "1px solid var(--line)",
              color: bulkAssignTo ? "#000" : "var(--muted)",
              cursor: bulkAssignTo ? "pointer" : "default",
              opacity: bulkAssigning ? 0.7 : 1,
            }}
          >
            {bulkAssigning ? "Assigning..." : "Assign Selected"}
          </button>

          <div style={{ width: 1, height: 24, background: "var(--line)" }} />

          {/* Bulk status change */}
          <button
            onClick={() => handleBulkStatus("in-progress")}
            disabled={bulkStatusChanging}
            style={{
              padding: "7px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              background: "hsla(45,100%,50%,0.12)",
              border: "1px solid hsla(45,100%,50%,0.4)",
              color: "hsl(45,100%,50%)",
              cursor: bulkStatusChanging ? "default" : "pointer",
              opacity: bulkStatusChanging ? 0.6 : 1,
            }}
          >
            Mark In-Progress
          </button>
          <button
            onClick={() => handleBulkStatus("resolved")}
            disabled={bulkStatusChanging}
            style={{
              padding: "7px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              background: "hsla(130,60%,50%,0.12)",
              border: "1px solid hsla(130,60%,50%,0.4)",
              color: "hsl(130,60%,50%)",
              cursor: bulkStatusChanging ? "default" : "pointer",
              opacity: bulkStatusChanging ? 0.6 : 1,
            }}
          >
            Mark Resolved
          </button>

          <button
            onClick={() => setSelectedIds([])}
            style={{
              padding: "7px 12px",
              borderRadius: 6,
              fontSize: 12,
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--muted)",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Clear selection
          </button>
        </div>
      )}

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
                  {canBulkAssign && (
                    <th style={{ width: 34, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: "pointer" }}
                        title="Select all visible open/in-progress tickets"
                      />
                    </th>
                  )}
                  <th style={{ width: 85 }}>Check</th>
                  <th style={{ width: 100 }}>Asset</th>
                  <th>Title</th>
                  <th style={{ width: 95 }}>Priority</th>
                  <th style={{ width: 105 }}>Status</th>
                  <th style={{ width: 140 }}>Assigned To</th>
                  <th style={{ width: 88 }}>Created</th>
                  <th style={{ width: 70 }}>Age</th>
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
                    selected={selectedIds.includes(ticket._id)}
                    onToggleSelect={toggleSelect}
                    canBulkAssign={canBulkAssign}
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
