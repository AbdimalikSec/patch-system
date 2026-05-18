import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const PRIORITY_COLOR = p => ({
  Critical: "hsl(350,100%,65%)", High: "hsl(25,100%,60%)",
  Medium: "hsl(45,100%,50%)", Low: "hsl(130,60%,50%)"
}[p] || "var(--muted)");

const ALL_ASSETS = ["DC1", "HQ-staff-01", "kali"];

const DEFAULT_GROUPS = [
  {
    name: "Domain Infrastructure",
    description: "Windows domain-joined machines managed by Active Directory",
    color: "hsl(210,80%,60%)",
    icon: "🏛️",
    members: ["DC1", "HQ-staff-01"],
    owner: "IT Infrastructure",
  },
  {
    name: "Security Operations",
    description: "Security testing and monitoring assets",
    color: "hsl(350,100%,65%)",
    icon: "🛡️",
    members: ["kali"],
    owner: "IT Security",
  },
];

function ScoreBar({ value, max = 100, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
    </div>
  );
}

function GroupCard({ group, onDelete, onRemoveMember, onAddMember }) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding]     = useState(false);
  const s = group.stats || {};
  const pc = PRIORITY_COLOR(s.highestPriority);

  const availableToAdd = ALL_ASSETS.filter(a => !group.members.includes(a));

  return (
    <div className="card" style={{ border: `1px solid ${group.color}44`, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, fontSize: 22,
            background: `${group.color}18`, border: `1px solid ${group.color}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{group.icon}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{group.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{group.description}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Owner: {group.owner} · {group.members.length} asset{group.members.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {s.highestPriority && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
              background: `${pc}18`, color: pc, border: `1px solid ${pc}44`,
            }}>{s.highestPriority} ({s.highestRiskScore})</span>
          )}
          <button className="btn" style={{ fontSize: 11, padding: "5px 10px" }}
            onClick={() => setExpanded(e => !e)}>
            {expanded ? "▲" : "▼"}
          </button>
          <button className="btn" style={{ fontSize: 11, padding: "5px 10px", color: "hsl(350,100%,65%)", borderColor: "hsla(350,100%,65%,0.3)" }}
            onClick={() => onDelete(group._id, group.name)}>
            Delete
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Missing Patches", value: s.totalMissing ?? "-", color: s.totalMissing > 0 ? "hsl(350,100%,65%)" : "hsl(130,60%,50%)" },
          { label: "CIS Failures", value: s.totalFailed ?? "-", color: s.totalFailed > 0 ? "hsl(25,100%,60%)" : "hsl(130,60%,50%)" },
          { label: "Compliance Score", value: s.complianceScore != null ? `${s.complianceScore}%` : "-", color: s.complianceScore < 50 ? "hsl(350,100%,65%)" : "hsl(130,60%,50%)" },
          { label: "Total Checks", value: s.totalChecks ?? "-", color: "var(--accent)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "10px 14px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Compliance bar */}
      {s.complianceScore != null && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
            <span>Group Compliance</span>
            <span>{s.complianceScore}%</span>
          </div>
          <ScoreBar value={s.complianceScore} color={s.complianceScore >= 70 ? "hsl(130,60%,50%)" : s.complianceScore >= 40 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)"} />
        </div>
      )}

      {/* Expanded — member list */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Group Members</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {group.members.map(hostname => (
              <div key={hostname} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 12px", borderRadius: 8,
                background: "var(--surface)", border: "1px solid var(--line)",
              }}>
                <Link to={`/asset/${encodeURIComponent(hostname)}`} style={{ fontSize: 13, fontWeight: 600 }}>
                  {hostname}
                </Link>
                <button
                  onClick={() => onRemoveMember(group._id, hostname)}
                  style={{ background: "none", border: "none", color: "hsl(350,100%,65%)", cursor: "pointer", fontSize: 14, padding: 0 }}
                >×</button>
              </div>
            ))}
          </div>

          {availableToAdd.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!adding ? (
                <button className="btn" style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => setAdding(true)}>
                  + Add Asset
                </button>
              ) : (
                <>
                  <select className="input" style={{ fontSize: 12, padding: "5px 10px" }}
                    onChange={e => { if (e.target.value) { onAddMember(group._id, e.target.value); setAdding(false); } }}>
                    <option value="">Select asset...</option>
                    {availableToAdd.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <button className="btn" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => setAdding(false)}>Cancel</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssetGroups() {
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [err, setErr]         = useState("");
  const [success, setSuccess] = useState("");

  // New group form
  const [form, setForm] = useState({ name: "", description: "", icon: "🗂️", owner: "IT", color: "hsl(210,80%,60%)" });

  async function load() {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/groups`);
      setGroups(res.data?.data || []);
    } catch (e) {
      setErr("Failed to load groups");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function seedDefaultGroups() {
    try {
      for (const g of DEFAULT_GROUPS) {
        await axios.post(`${API}/api/groups`, g);
      }
      setSuccess("Default groups created");
      load();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to seed groups");
    }
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await axios.post(`${API}/api/groups`, { ...form, members: [] });
      setSuccess(`Group "${form.name}" created`);
      setForm({ name: "", description: "", icon: "🗂️", owner: "IT", color: "hsl(210,80%,60%)" });
      load();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id, name) {
    try {
      await axios.delete(`${API}/api/groups/${id}`);
      setSuccess(`Group "${name}" deleted`);
      load();
    } catch (e) {
      setErr("Failed to delete group");
    }
  }

  async function handleRemoveMember(groupId, hostname) {
    try {
      await axios.delete(`${API}/api/groups/${groupId}/members/${hostname}`);
      load();
    } catch (e) {
      setErr("Failed to remove member");
    }
  }

  async function handleAddMember(groupId, hostname) {
    try {
      await axios.post(`${API}/api/groups/${groupId}/members`, { hostname });
      load();
    } catch (e) {
      setErr("Failed to add member");
    }
  }

  return (
    <Layout title="Asset Groups">
      {err && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, background: "hsla(350,100%,65%,0.1)", border: "1px solid hsla(350,100%,65%,0.3)", color: "hsl(350,100%,65%)", fontSize: 13 }}
          onClick={() => setErr("")}>{err}</div>
      )}
      {success && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, background: "hsla(130,60%,50%,0.1)", border: "1px solid hsla(130,60%,50%,0.3)", color: "hsl(130,60%,50%)", fontSize: 13 }}
          onClick={() => setSuccess("")}>{success}</div>
      )}

      {/* Create group */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Create Asset Group</div>
        <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 140px 100px", gap: 10, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>Icon</div>
            <input className="input" style={{ textAlign: "center", fontSize: 20 }}
              value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>Group Name</div>
            <input className="input" placeholder="e.g. Domain Infrastructure"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>Description</div>
            <input className="input" placeholder="Brief description"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>Owner</div>
            <input className="input" placeholder="IT"
              value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
          </div>
          <button className="btn" onClick={handleCreate} disabled={creating || !form.name.trim()}
            style={{ opacity: creating || !form.name.trim() ? 0.5 : 1 }}>
            {creating ? "..." : "Create"}
          </button>
        </div>
      </div>

      {loading && <div className="muted">Loading groups...</div>}

      {!loading && groups.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No groups yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
            Create your first group or use the defaults for your lab setup.
          </div>
          <button className="btn" onClick={seedDefaultGroups} style={{ fontSize: 13 }}>
            🚀 Create Default Groups (Domain Infrastructure + Security Operations)
          </button>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <>
          {/* Summary KPIs */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <div className="card" style={{ flex: 1, minWidth: 140, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total Groups</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>{groups.length}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 140, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Critical Groups</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "hsl(350,100%,65%)" }}>
                {groups.filter(g => g.stats?.highestPriority === "Critical").length}
              </div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 140, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total Assets</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                {[...new Set(groups.flatMap(g => g.members))].length}
              </div>
            </div>
            <div className="card" style={{ flex: 2, minWidth: 200, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Groups by Risk</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["Critical","High","Medium","Low"].map(p => {
                  const count = groups.filter(g => g.stats?.highestPriority === p).length;
                  return count > 0 ? (
                    <span key={p} style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 4,
                      background: `${PRIORITY_COLOR(p)}18`, color: PRIORITY_COLOR(p),
                      border: `1px solid ${PRIORITY_COLOR(p)}44`,
                    }}>{p}: {count}</span>
                  ) : null;
                })}
              </div>
            </div>
          </div>

          {groups.map(group => (
            <GroupCard
              key={group._id}
              group={group}
              onDelete={handleDelete}
              onRemoveMember={handleRemoveMember}
              onAddMember={handleAddMember}
            />
          ))}
        </>
      )}
    </Layout>
  );
}