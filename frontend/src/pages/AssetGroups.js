import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";




const DEFAULT_GROUPS = [
  {
    name: "Domain Infrastructure",
    description: "Windows domain-joined machines managed by Active Directory",
    color: "hsl(210,80%,60%)",
    icon: "🏛️",
    members: [],
    owner: "IT Infrastructure",
    category: "domain",
  },
  {
    name: "Security Operations",
    description: "Dedicated security-testing machines",
    color: "hsl(350,100%,65%)",
    icon: "🛡️",
    members: [],
    owner: "IT Security",
    category: "security",
  },
  {
    name: "Physical / BYOD Workstations",
    description: "Non-domain-joined physical machines — personal or field devices",
    color: "hsl(45,100%,55%)",
    icon: "💻",
    members: [],
    owner: "IT Operations",
    category: "physical",
  },
];

const CATEGORY_LABELS = {
  domain: "Domain-joined",
  physical: "Physical / standalone",
  security: "Security testing",
};

function priorityColor(p) {
  return { Critical: "hsl(350,100%,65%)", High: "hsl(25,100%,60%)", Medium: "hsl(45,100%,50%)", Low: "hsl(130,60%,50%)" }[p] || "var(--muted)";
}

function KpiTile({ label, value, color }) {
  return (
    <div style={{
      padding: "14px 16px", background: "var(--surface)",
      borderRadius: 8, border: "1px solid var(--line)", flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || "var(--text)" }}>{value ?? "—"}</div>
    </div>
  );
}

function ComplianceBar({ value }) {
  if (value == null) return null;
  const color = value >= 70 ? "hsl(130,60%,50%)" : value >= 40 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        <span>Group Compliance</span><span style={{ color, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

// `assetCategoryMap`: { hostname -> networkCategory }
// `hostnameOwnerGroup`: { hostname -> groupId of whichever group currently holds it, if any }
function GroupCard({ group, allAssets = [], assetCategoryMap = {}, hostnameOwnerGroup = {}, onDelete, onRemoveMember, onAddMember }) {
  const [expanded, setExpanded] = useState(true);
  const [addingAsset, setAddingAsset] = useState(false);
  const [selectedAdd, setSelectedAdd] = useState("");
  const s = group.stats || {};
  const pc = priorityColor(s.highestPriority);

  // Only offer assets that are: not already in THIS group, not already in
  // ANY other group (real exclusivity, matching the backend rule exactly),
  // and — if this group is category-gated — matching that category.
  const available = allAssets.filter((a) => {
    if (group.members.includes(a)) return false;
    const ownerGroupId = hostnameOwnerGroup[a];
    if (ownerGroupId && ownerGroupId !== group._id) return false;
    if (group.category && group.category !== "custom") {
      if (assetCategoryMap[a] !== group.category) return false;
    }
    return true;
  });

  return (
    <div style={{
      background: "var(--panel)", borderRadius: 12,
      border: `1px solid ${group.color}55`, overflow: "hidden", marginBottom: 16,
    }}>
      <div style={{ height: 3, background: group.color }} />

      <div style={{ padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 10, fontSize: 22,
            background: `${group.color}18`, border: `1px solid ${group.color}44`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>{group.icon}</div>
           <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{group.name}</div>
              {group.category && group.category !== "custom" && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                  textTransform: "uppercase", background: "var(--surface)",
                  border: "1px solid var(--line)", color: "var(--muted)",
                }}>
                  {group.category} only
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{group.description}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
              Owner: <span style={{ color: "var(--text)" }}>{group.owner}</span>
              {" · "}
              <span style={{ color: "var(--text)" }}>{group.members.length} asset{group.members.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {s.highestPriority && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
              background: `${pc}18`, color: pc, border: `1px solid ${pc}44`,
            }}>{s.highestPriority} · {s.highestRiskScore}</span>
          )}
          <button onClick={() => setExpanded(e => !e)} style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: "var(--muted)", fontSize: 12,
          }}>{expanded ? "▲ Collapse" : "▼ Expand"}</button>
          <button onClick={() => onDelete(group._id, group.name)} style={{
            background: "hsla(350,100%,65%,0.08)", border: "1px solid hsla(350,100%,65%,0.3)",
            borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: "hsl(350,100%,65%)", fontSize: 12,
          }}>Delete</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 22px 22px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <KpiTile label="Missing Patches" value={s.totalMissing ?? "—"} color={s.totalMissing > 0 ? "hsl(350,100%,65%)" : "hsl(130,60%,50%)"} />
            <KpiTile label="CIS Failures" value={s.totalFailed ?? "—"} color={s.totalFailed > 0 ? "hsl(25,100%,60%)" : "hsl(130,60%,50%)"} />
            <KpiTile label="Total Checks" value={s.totalChecks ?? "—"} color="var(--accent)" />
            <KpiTile label="Compliance %" value={s.complianceScore != null ? `${s.complianceScore}%` : "—"}
              color={s.complianceScore != null ? (s.complianceScore >= 70 ? "hsl(130,60%,50%)" : s.complianceScore >= 40 ? "hsl(45,100%,50%)" : "hsl(350,100%,65%)") : "var(--muted)"} />
            <KpiTile label="Highest Risk" value={s.highestRiskScore ?? "—"} color={priorityColor(s.highestPriority)} />
          </div>

          {s.complianceScore != null && (
            <div style={{ marginBottom: 16 }}>
              <ComplianceBar value={s.complianceScore} />
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {group.members.map((hostname) => (
              <div key={hostname} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 20,
                background: "var(--surface)", border: "1px solid var(--line)",
              }}>
                <Link to={`/asset/${encodeURIComponent(hostname)}`} style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
                  {hostname}
                </Link>
                <button onClick={() => onRemoveMember(group._id, hostname)} style={{
                  background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
                }}>×</button>
              </div>
            ))}
            {available.length > 0 && !addingAsset && (
              <button onClick={() => setAddingAsset(true)} style={{
                padding: "5px 12px", borderRadius: 20, background: "transparent",
                border: "1px dashed var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 12,
              }}>+ Add asset</button>
            )}
            {available.length === 0 && !addingAsset && (
              <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
                {group.category && group.category !== "custom"
                  ? `No eligible ${CATEGORY_LABELS[group.category] || group.category} machines available to add`
                  : "No eligible machines available to add"}
              </span>
            )}
            {addingAsset && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select value={selectedAdd} onChange={e => setSelectedAdd(e.target.value)} style={{
                  padding: "5px 10px", borderRadius: 6, fontSize: 12,
                  background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)",
                }}>
                  <option value="">Pick asset...</option>
                  {available.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <button onClick={() => { if (selectedAdd) { onAddMember(group._id, selectedAdd); setSelectedAdd(""); setAddingAsset(false); } }}
                  disabled={!selectedAdd} style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 12,
                    background: selectedAdd ? "var(--accent)" : "var(--surface)",
                    border: "1px solid var(--line)", color: selectedAdd ? "#000" : "var(--muted)",
                    cursor: selectedAdd ? "pointer" : "default",
                  }}>Add</button>
                <button onClick={() => { setAddingAsset(false); setSelectedAdd(""); }} style={{
                  padding: "5px 10px", borderRadius: 6, fontSize: 12,
                  background: "transparent", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer",
                }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssetGroups() {
  const [groups, setGroups]         = useState([]);
  const [allAssets, setAllAssets] = useState([]);
  const [assetCategoryMap, setAssetCategoryMap] = useState({});
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]           = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState({ name: "", description: "", icon: "🗂️", owner: "IT", color: "hsl(210,80%,60%)", category: "custom" });

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const [groupsRes, assetsRes, machinesRes] = await Promise.all([
        axios.get(`${API}/api/groups`),
        axios.get(`${API}/api/assets/overview`),
        axios.get(`${API}/api/machines`).catch(() => ({ data: { data: [] } })),
      ]);
      setGroups(groupsRes.data?.data || []);
      const hostnames = (assetsRes.data?.data || []).map((a) => a.hostname);
      setAllAssets(hostnames);

      // networkCategory lives on the Agent registry (/api/machines), not on
      // the Assets overview — build a hostname -> category lookup so the
      // "+ Add asset" dropdown can actually filter by eligibility instead of
      // just listing everything and letting the backend reject it later.
      const categoryMap = {};
      for (const m of machinesRes.data?.data || []) {
        if (m.hostname) categoryMap[m.hostname] = m.networkCategory || "physical";
      }
      setAssetCategoryMap(categoryMap);
    } catch {
      showToast("err", "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSeedDefaults() {
    setSubmitting(true);
    try {
      for (const g of DEFAULT_GROUPS) {
        await axios.post(`${API}/api/groups`, g).catch(() => {});
      }
      showToast("ok", "Default groups created");
      load();
    } catch {
      showToast("err", "Failed to create default groups");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/groups`, { ...form, members: [] });
      showToast("ok", `Group "${form.name}" created`);
      setForm({ name: "", description: "", icon: "🗂️", owner: "IT", color: "hsl(210,80%,60%)", category: "custom" });
      setShowCreate(false)
      load();
    } catch (e) {
      showToast("err", e?.response?.data?.error || "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete group "${name}"?`)) return;
    try {
      await axios.delete(`${API}/api/groups/${id}`);
      showToast("ok", `Group "${name}" deleted`);
      load();
    } catch {
      showToast("err", "Failed to delete group");
    }
  }

  async function handleRemoveMember(groupId, hostname) {
    try {
      await axios.delete(`${API}/api/groups/${groupId}/members/${hostname}`);
      load();
    } catch { showToast("err", "Failed to remove member"); }
  }

  async function handleAddMember(groupId, hostname) {
    try {
      await axios.post(`${API}/api/groups/${groupId}/members`, { hostname });
      load();
    } catch (e) {
      showToast("err", e?.response?.data?.error || "Failed to add member");
    }
  }

  const totalAssets    = [...new Set(groups.flatMap(g => g.members))].length;
  const criticalGroups = groups.filter(g => g.stats?.highestPriority === "Critical").length;

  // hostname -> which group currently owns it (for real, global exclusivity
  // in the frontend filter, matching the backend's rule exactly).
  const hostnameOwnerGroup = {};
  for (const g of groups) {
    for (const hostname of g.members) {
      hostnameOwnerGroup[hostname] = g._id;
    }
  }

  return (
    <Layout title="Asset Groups">

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

      {/* Summary + action buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Groups", value: groups.length, color: "var(--text)" },
            { label: "Assets", value: totalAssets, color: "var(--text)" },
            { label: "Critical Groups", value: criticalGroups, color: criticalGroups > 0 ? "hsl(350,100%,65%)" : "var(--text)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: "12px 20px", minWidth: 110 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSeedDefaults} disabled={submitting} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "transparent", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer",
          }}>🚀 Create Defaults</button>
          <button onClick={() => setShowCreate(c => !c)} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: "var(--accent)", border: "none", color: "#000", cursor: "pointer",
          }}>{showCreate ? "✕ Cancel" : "+ New Group"}</button>
        </div>
      </div>

      {/* Create form — two rows, no collapsing grid */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 24, borderColor: "var(--accent)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 16 }}>New Group</div>

          {/* Row 1: icon + name side by side */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-end" }}>
            <div style={{ flexShrink: 0, width: 64 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Icon</div>
              <input className="input" style={{ textAlign: "center", fontSize: 20, padding: "8px", width: "64px" }}
                value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Group Name *</div>
              <input className="input" style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="e.g. Domain Infrastructure"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleCreate()} />
            </div>
          </div>

          {/* Row 2: description + owner side by side */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Description</div>
              <input className="input" style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="Brief description of this group"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Owner</div>
              <input className="input" style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="IT"
                value={form.owner}
                onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
            </div>
          </div>

          {/* Row: category */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Eligibility Category</div>
            <select className="input" style={{ width: "100%", maxWidth: 320, boxSizing: "border-box" }}
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="custom">Custom — any machine can join</option>
              <option value="domain">Domain-joined only</option>
              <option value="physical">Physical / standalone only</option>
              <option value="security">Security testing tools only</option>
            </select>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>
              A machine can only belong to one group at a time, regardless of category.
            </div>
          </div>

          {/* Row 3: color swatches + create button */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Color:</span>
            {["hsl(210,80%,60%)", "hsl(350,100%,65%)", "hsl(130,60%,50%)", "hsl(45,100%,50%)", "hsl(280,80%,65%)"].map(c => (
              <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{
                width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer",
                outline: form.color === c ? `3px solid ${c}` : "2px solid transparent", outlineOffset: 2,
              }} />
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={handleCreate} disabled={submitting || !form.name.trim()} style={{
              padding: "9px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: form.name.trim() ? "var(--accent)" : "var(--surface)",
              border: "1px solid var(--line)",
              color: form.name.trim() ? "#000" : "var(--muted)",
              cursor: form.name.trim() ? "pointer" : "default",
            }}>{submitting ? "Creating..." : "Create Group"}</button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: "var(--muted)", fontSize: 13, padding: 20 }}>Loading groups...</div>}

      {!loading && groups.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>🗂️</div>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>No groups yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24 }}>
            Groups show combined risk across multiple assets — useful for department-level reporting.
          </div>
          <button onClick={handleSeedDefaults} disabled={submitting} style={{
            padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: "var(--accent)", border: "none", color: "#000", cursor: "pointer",
          }}>Create Default Groups</button>
        </div>
      )}

      {!loading && groups.map(group => (
        <GroupCard key={group._id} group={group} allAssets={allAssets}
          assetCategoryMap={assetCategoryMap} hostnameOwnerGroup={hostnameOwnerGroup}
          onDelete={handleDelete} onRemoveMember={handleRemoveMember} onAddMember={handleAddMember} />
      ))}

    </Layout>
  );
}
