import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const RED = "#C0392B";
const GREEN = "#1E8449";
const NEUTRAL_TEXT = "var(--text)";
const NEUTRAL_MUTED = "var(--muted)";

const DEFAULT_GROUPS = [
  {
    name: "Domain Infrastructure",
    description: "Windows domain-joined machines managed by Active Directory",
    icon: "📁",
    members: [],
    owner: "IT Infrastructure",
    category: "domain",
  },
  {
    name: "Security Operations",
    description: "Dedicated security-testing machines",
    icon: "📁",
    members: [],
    owner: "IT Security",
    category: "security",
  },
  {
    name: "Physical / BYOD Workstations",
    description: "Non-domain-joined physical machines — personal or field devices",
    icon: "📁",
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

function KpiTile({ label, value, isBad }) {
  return (
    <div style={{
      padding: "14px 16px", background: "var(--surface)",
      borderRadius: 8, border: "1px solid var(--line)", flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: isBad ? RED : NEUTRAL_TEXT }}>{value ?? "—"}</div>
    </div>
  );
}

function ComplianceBar({ value }) {
  if (value == null) return null;
  const color = value >= 70 ? GREEN : value >= 40 ? "#D68910" : RED;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: NEUTRAL_MUTED, marginBottom: 4 }}>
        <span>Group Compliance</span><span style={{ color, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function GroupCard({ group, allAssets = [], assetCategoryMap = {}, hostnameOwnerGroup = {}, onDelete, onRemoveMember, onAddMember }) {
  const [expanded, setExpanded] = useState(true);
  const [addingAsset, setAddingAsset] = useState(false);
  const [selectedAdd, setSelectedAdd] = useState("");
  const s = group.stats || {};
  const isCritical = s.highestPriority === "Critical" || s.highestPriority === "High";

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
      border: "1px solid var(--line)", overflow: "hidden", marginBottom: 12,
    }}>
      <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, fontSize: 18,
            background: "var(--surface)", border: "1px solid var(--line)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>📁</div>
           <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{group.name}</div>
              {group.category && group.category !== "custom" && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                  textTransform: "uppercase", background: "var(--surface)",
                  border: "1px solid var(--line)", color: NEUTRAL_MUTED,
                }}>
                  {group.category} only
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: NEUTRAL_MUTED }}>{group.description}</div>
            <div style={{ fontSize: 11, color: NEUTRAL_MUTED, marginTop: 3 }}>
              Owner: <span style={{ color: NEUTRAL_TEXT }}>{group.owner}</span>
              {" · "}
              <span style={{ color: NEUTRAL_TEXT }}>{group.members.length} asset{group.members.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {s.highestPriority && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
              background: isCritical ? "#FDEDEC" : "var(--surface)",
              color: isCritical ? RED : NEUTRAL_MUTED,
              border: "1px solid var(--line)",
            }}>{s.highestPriority} · {s.highestRiskScore}</span>
          )}
          <button onClick={() => setExpanded(e => !e)} style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: NEUTRAL_MUTED, fontSize: 12,
          }}>{expanded ? "Collapse" : "Expand"}</button>
          <button onClick={() => onDelete(group._id, group.name)} style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: NEUTRAL_TEXT, fontSize: 12,
          }}>Delete</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 20px 18px", borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <KpiTile label="Missing Patches" value={s.totalMissing ?? "—"} isBad={s.totalMissing > 0} />
            <KpiTile label="CIS Failures" value={s.totalFailed ?? "—"} isBad={s.totalFailed > 0} />
            <KpiTile label="Total Checks" value={s.totalChecks ?? "—"} />
            <KpiTile label="Compliance %" value={s.complianceScore != null ? `${s.complianceScore}%` : "—"} isBad={s.complianceScore != null && s.complianceScore < 40} />
            <KpiTile label="Highest Risk" value={s.highestRiskScore ?? "—"} isBad={isCritical} />
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
                padding: "5px 12px", borderRadius: 6,
                background: "var(--surface)", border: "1px solid var(--line)",
              }}>
                <Link to={`/asset/${encodeURIComponent(hostname)}`} style={{ fontSize: 12.5, fontWeight: 600, color: NEUTRAL_TEXT, textDecoration: "none" }}>
                  {hostname}
                </Link>
                <button onClick={() => onRemoveMember(group._id, hostname)} style={{
                  background: "none", border: "none", color: NEUTRAL_MUTED, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0,
                }}>×</button>
              </div>
            ))}
            {available.length > 0 && !addingAsset && (
              <button onClick={() => setAddingAsset(true)} style={{
                padding: "5px 12px", borderRadius: 6, background: "transparent",
                border: "1px dashed var(--line)", color: NEUTRAL_MUTED, cursor: "pointer", fontSize: 12,
              }}>+ Add asset</button>
            )}
            {available.length === 0 && !addingAsset && (
              <span style={{ fontSize: 11, color: NEUTRAL_MUTED, fontStyle: "italic" }}>
                {group.category && group.category !== "custom"
                  ? `No eligible ${CATEGORY_LABELS[group.category] || group.category} machines available to add`
                  : "No eligible machines available to add"}
              </span>
            )}
            {addingAsset && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select value={selectedAdd} onChange={e => setSelectedAdd(e.target.value)} style={{
                  padding: "5px 10px", borderRadius: 6, fontSize: 12,
                  background: "var(--surface)", border: "1px solid var(--line)", color: NEUTRAL_TEXT,
                }}>
                  <option value="">Pick asset...</option>
                  {available.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <button onClick={() => { if (selectedAdd) { onAddMember(group._id, selectedAdd); setSelectedAdd(""); setAddingAsset(false); } }}
                  disabled={!selectedAdd} style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 12,
                    background: selectedAdd ? "var(--accent)" : "var(--surface)",
                    border: "1px solid var(--line)", color: selectedAdd ? "#000" : NEUTRAL_MUTED,
                    cursor: selectedAdd ? "pointer" : "default",
                  }}>Add</button>
                <button onClick={() => { setAddingAsset(false); setSelectedAdd(""); }} style={{
                  padding: "5px 10px", borderRadius: 6, fontSize: 12,
                  background: "transparent", border: "1px solid var(--line)", color: NEUTRAL_MUTED, cursor: "pointer",
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
  const [form, setForm]             = useState({ name: "", description: "", owner: "IT", category: "custom" });

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
      await axios.post(`${API}/api/groups`, { ...form, icon: "📁", members: [] });
      showToast("ok", `Group "${form.name}" created`);
      setForm({ name: "", description: "", owner: "IT", category: "custom" });
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
          background: toast.type === "ok" ? "#EAFAF1" : "#FDEDEC",
          border: `1px solid ${toast.type === "ok" ? GREEN : RED}`,
          color: toast.type === "ok" ? GREEN : RED,
        }}>
          {toast.type === "ok" ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Groups", value: groups.length, isBad: false },
            { label: "Assets", value: totalAssets, isBad: false },
            { label: "Critical Groups", value: criticalGroups, isBad: criticalGroups > 0 },
          ].map(({ label, value, isBad }) => (
            <div key={label} className="card" style={{ padding: "12px 18px", minWidth: 100, border: "1px solid var(--line)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: isBad ? RED : NEUTRAL_TEXT }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSeedDefaults} disabled={submitting} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "transparent", border: "1px solid var(--line)", color: NEUTRAL_MUTED, cursor: "pointer",
          }}>Create Defaults</button>
          <button onClick={() => setShowCreate(c => !c)} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: "var(--accent)", border: "none", color: "#000", cursor: "pointer",
          }}>{showCreate ? "Cancel" : "+ New Group"}</button>
        </div>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 20, border: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>New Group</div>

          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", marginBottom: 5 }}>Group Name *</div>
              <input className="input" style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="e.g. Domain Infrastructure"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleCreate()} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", marginBottom: 5 }}>Owner</div>
              <input className="input" style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="IT"
                value={form.owner}
                onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", marginBottom: 5 }}>Description</div>
            <input className="input" style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="Brief description of this group"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: NEUTRAL_MUTED, textTransform: "uppercase", marginBottom: 5 }}>Eligibility Category</div>
            <select className="input" style={{ width: "100%", maxWidth: 320, boxSizing: "border-box" }}
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="custom">Custom — any machine can join</option>
              <option value="domain">Domain-joined only</option>
              <option value="physical">Physical / standalone only</option>
              <option value="security">Security testing tools only</option>
            </select>
            <div style={{ fontSize: 10.5, color: NEUTRAL_MUTED, marginTop: 4, lineHeight: 1.4 }}>
              A machine can only belong to one group at a time, regardless of category.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleCreate} disabled={submitting || !form.name.trim()} style={{
              padding: "9px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: form.name.trim() ? "var(--accent)" : "var(--surface)",
              border: "1px solid var(--line)",
              color: form.name.trim() ? "#000" : NEUTRAL_MUTED,
              cursor: form.name.trim() ? "pointer" : "default",
            }}>{submitting ? "Creating..." : "Create Group"}</button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: NEUTRAL_MUTED, fontSize: 13, padding: 20 }}>Loading groups...</div>}

      {!loading && groups.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "40px 24px", border: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>No groups yet</div>
          <div style={{ fontSize: 13, color: NEUTRAL_MUTED, marginBottom: 20 }}>
            Groups show combined risk across multiple assets — useful for department-level reporting.
          </div>
          <button onClick={handleSeedDefaults} disabled={submitting} style={{
            padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
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
