import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Layout from "../Layout";
import { useAuth } from "../context/AuthContext";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const SLA_HOURS = { Critical: 48, High: 168, Medium: 720, Low: 2160 };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getSLAStatus(priority, collectedAt) {
  if (!collectedAt || !priority) return null;
  const hours = SLA_HOURS[priority];
  if (!hours) return null;
  const elapsed = (Date.now() - new Date(collectedAt).getTime()) / 3600000;
  const remaining = hours - elapsed;
  if (remaining < 0)
    return {
      status: "breached",
      label: `Breached ${Math.abs(Math.floor(remaining / 24))}d ago`,
      color: "hsl(350,75%,50%)",
    };
  if (remaining < 24)
    return {
      status: "due_soon",
      label: `Due in ${Math.round(remaining)}h`,
      color: "hsl(30,90%,45%)",
    };
  return {
    status: "ok",
    label: `${Math.floor(remaining / 24)}d remaining`,
    color: "hsl(145,55%,38%)",
  };
}

function normalizeMissingItem(x) {
  if (x == null) return "";
  return String(x).trim();
}

function toLocal(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function rankPriority(p) {
  return { Critical: 4, High: 3, Medium: 2, Low: 1 }[p] || 0;
}

// ── Shared visual primitives, matching the established light theme ─────────────
const cardStyle = {
  background: "var(--panel)",
  border: "1px solid var(--panel-border)",
  borderRadius: "var(--radius-lg)",
};

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function ActionButton({ children, onClick, disabled, variant = "default", ...rest }) {
  const variants = {
    default: { bg: "var(--surface)", border: "var(--line)", color: "var(--text)" },
    primary: { bg: "hsla(210,90%,55%,0.1)", border: "hsla(210,90%,55%,0.35)", color: "hsl(210,90%,45%)" },
    subtle: { bg: "transparent", border: "var(--line)", color: "var(--muted)" },
  };
  const v = variants[variant] || variants.default;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        padding: "7px 14px",
        borderRadius: 7,
        background: v.bg,
        border: `1px solid ${v.border}`,
        color: v.color,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Apt Update Button (Linux package index refresh) ─────────────────────────────
function AptUpdateButton({ hostname, canPatch }) {
  const [state, setState] = useState("idle");
  const [output, setOutput] = useState("");

  async function handleUpdate() {
    if (!window.confirm(`Refresh the package index on ${hostname}?`)) return;
    setState("updating");
    setOutput("");
    try {
      const res = await axios.post(`${API}/api/deploy/apt-update`, { hostname });
      if (res.data?.ok) {
        setState("done");
        setOutput("Package index refreshed");
        setTimeout(() => setState("idle"), 5000);
      } else {
        setState("error");
        setOutput(res.data?.output || res.data?.error || "Update failed");
      }
    } catch (e) {
      setState("error");
      setOutput(e?.response?.data?.error || e.message);
    }
  }

  if (!canPatch) return null;

  if (state === "updating")
    return <span style={{ fontSize: 12, color: "hsl(30,90%,45%)", fontWeight: 600 }}>Refreshing index…</span>;
  if (state === "done")
    return <span style={{ fontSize: 12, color: "hsl(145,55%,38%)", fontWeight: 600 }}>Index refreshed</span>;
  if (state === "error")
    return (
      <div>
        <span style={{ fontSize: 12, color: "hsl(350,75%,50%)", fontWeight: 600 }}>Refresh failed</span>
        {output && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{output.slice(0, 120)}</div>}
      </div>
    );

  return <ActionButton onClick={handleUpdate}>Refresh package index</ActionButton>;
}

// ── Patch All Missing (single machine) ──────────────────────────────────────────
function PatchAllButton({ hostname, missingCount, canPatch, onDone }) {
  const [state, setState] = useState("idle");
  const [summary, setSummary] = useState("");

  if (!canPatch || missingCount === 0) return null;

  async function handlePatchAll() {
    if (
      !window.confirm(
        `Deploy all ${missingCount} missing update${missingCount > 1 ? "s" : ""} on ${hostname}?\n\nUpdates are installed one at a time. This may take a while.`,
      )
    )
      return;
    setState("running");
    setSummary("");
    try {
      const res = await axios.post(`${API}/api/deploy/patch-all`, { hostname });
      const { succeeded, failed, count } = res.data || {};
      setState(failed > 0 ? "partial" : "done");
      setSummary(`${succeeded ?? 0} of ${count ?? missingCount} deployed`);
      setTimeout(() => {
        setState("idle");
        onDone();
      }, 6000);
    } catch (e) {
      setState("error");
      setSummary(e?.response?.data?.error || e.message);
    }
  }

  if (state === "running")
    return <span style={{ fontSize: 12, color: "hsl(30,90%,45%)", fontWeight: 600 }}>Deploying {missingCount} updates…</span>;
  if (state === "done")
    return <span style={{ fontSize: 12, color: "hsl(145,55%,38%)", fontWeight: 600 }}>{summary}</span>;
  if (state === "partial")
    return <span style={{ fontSize: 12, color: "hsl(30,90%,45%)", fontWeight: 600 }}>{summary}</span>;
  if (state === "error")
    return <span style={{ fontSize: 12, color: "hsl(350,75%,50%)", fontWeight: 600 }}>{summary}</span>;

  return (
    <ActionButton variant="primary" onClick={handlePatchAll}>
      Patch all missing ({missingCount})
    </ActionButton>
  );
}

// ── Patch Now Button (single item) ──────────────────────────────────────────────
function PatchNowButton({ hostname, pkg, os, role, onPatched, alreadyQueued, activeCommand, canPatch }) {
  const [state, setState] = useState(() => {
    if (activeCommand?.status === "pending") return "queued";
    if (activeCommand?.status === "running") return "patching";
    if (activeCommand?.status === "success") return "done";
    if (activeCommand?.status === "failed") return "error";
    return "idle";
  });
  const [output, setOutput] = useState(activeCommand?.output || "");
  const [commandId, setCommandId] = useState(activeCommand?.commandId || null);

  const isWindows = (os || "").toLowerCase() === "windows";
  const isLinux = (os || "").toLowerCase() === "linux";

  useEffect(() => {
    if (state !== "queued" || !commandId) return;
    const interval = setInterval(async () => {
      try {
        const statusRes = await axios.get(`${API}/api/agent/commands/status/${commandId}`);
        const cmd = statusRes.data?.command;
        if (cmd?.status === "success") {
          clearInterval(interval);
          setState("done");
          setOutput(`Installed — restart ${hostname} to apply`);
          setTimeout(() => {
            setState("idle");
            onPatched();
          }, 8000);
        } else if (cmd?.status === "failed") {
          clearInterval(interval);
          setState("error");
          setOutput(cmd.output || "Installation failed");
        }
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [commandId, state]);

  if (!isLinux && !isWindows) return null;

  if (isWindows && !pkg.match(/KB\d+/i)) {
    return <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>No KB number</span>;
  }

  if (isWindows && alreadyQueued) {
    return <span style={{ fontSize: 11, color: "hsl(30,90%,45%)", fontWeight: 600 }}>Pending restart</span>;
  }

  async function handlePatch() {
    const confirmMsg = isWindows
      ? `Verify ${pkg} on ${hostname}?\n\nThis confirms the update is pending. Restart during a maintenance window to apply.`
      : `Patch ${pkg} on ${hostname}?`;
    if (!window.confirm(confirmMsg)) return;
    setState("patching");
    setOutput("");
    await new Promise((r) => setTimeout(r, 400));

    try {
      const res = await axios.post(`${API}/api/deploy/patch`, { hostname, package: pkg });
      if (res.data?.ok) {
        setOutput(res.data.output || "");
        if (!isWindows) {
          setState("done");
          setTimeout(() => {
            setState("idle");
            onPatched();
          }, 5000);
        } else {
          setState("queued");
          if (res.data.commandId) setCommandId(res.data.commandId);
        }
      } else {
        setState("error");
        setOutput(res.data?.output || res.data?.error || "Unknown error");
      }
    } catch (e) {
      setState("error");
      setOutput(e?.response?.data?.error || e.message);
    }
  }

  if (state === "patching") return <span style={{ fontSize: 11, color: "hsl(30,90%,45%)", fontWeight: 600 }}>Patching…</span>;

  if (state === "queued")
    return (
      <div>
        <span style={{ fontSize: 11, color: "hsl(210,90%,45%)", fontWeight: 600 }}>Agent installing…</span>
        {output && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, maxWidth: 220 }}>{output.slice(0, 100)}</div>}
      </div>
    );

  if (state === "done")
    return (
      <div>
        <span style={{ fontSize: 11, color: "hsl(30,90%,45%)", fontWeight: 600 }}>
          {isWindows ? "Pending restart" : "Done"}
        </span>
        {output && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, maxWidth: 220 }}>{output.slice(0, 100)}</div>}
        {isWindows && canPatch && (role || "").toLowerCase() !== "domain controller" && (
          <button
            onClick={async () => {
              if (!window.confirm(`Restart ${hostname} now?\n\nThe machine restarts in 60 seconds. Unsaved work will be lost.`)) return;
              try {
                const res = await axios.post(`${API}/api/deploy/restart`, { hostname });
                if (res.data?.ok) {
                  setState("restarting");
                  setOutput("Restart scheduled — 60 seconds");
                } else {
                  alert(res.data?.error || "Restart failed");
                }
              } catch (e) {
                alert(e?.response?.data?.error || e.message);
              }
            }}
            style={{
              fontSize: 10.5,
              padding: "3px 9px",
              marginTop: 6,
              borderRadius: 5,
              background: "transparent",
              border: "1px solid hsla(350,75%,50%,0.3)",
              color: "hsl(350,75%,50%)",
              cursor: "pointer",
            }}
          >
            Restart now
          </button>
        )}
      </div>
    );

  if (state === "restarting")
    return (
      <div>
        <span style={{ fontSize: 11, color: "hsl(350,75%,50%)", fontWeight: 600 }}>Restarting…</span>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>60 seconds</div>
      </div>
    );

  if (state === "error")
    return (
      <div>
        <span style={{ fontSize: 11, color: "hsl(350,75%,50%)", fontWeight: 600 }}>Failed</span>
        {output && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, maxWidth: 200 }}>{output.slice(0, 120)}</div>}
      </div>
    );

  if (!canPatch) return null;

  return (
    <button
      onClick={handlePatch}
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        padding: "5px 12px",
        borderRadius: 6,
        background: isWindows ? "hsla(210,90%,55%,0.1)" : "hsla(145,55%,42%,0.1)",
        border: isWindows ? "1px solid hsla(210,90%,55%,0.3)" : "1px solid hsla(145,55%,42%,0.3)",
        color: isWindows ? "hsl(210,90%,45%)" : "hsl(145,55%,32%)",
        cursor: "pointer",
      }}
    >
      Patch now
    </button>
  );
}

// ── Maintenance Window panel ─────────────────────────────────────────────────────
function MaintenancePanel({ groups, schedules, isAdmin, onSaved }) {
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [draft, setDraft] = useState({ enabled: false, dayOfWeek: 0, hour: 2, minute: 0 });
  const [saving, setSaving] = useState(false);

  function scheduleFor(groupId) {
    return schedules.find((s) => s.groupId === groupId) || null;
  }

  function startEdit(group) {
    const existing = scheduleFor(group._id);
    setDraft({
      enabled: existing?.enabled ?? false,
      dayOfWeek: existing?.dayOfWeek ?? 0,
      hour: existing?.hour ?? 2,
      minute: existing?.minute ?? 0,
    });
    setEditingGroupId(group._id);
  }

  async function handleSave(groupId) {
    setSaving(true);
    try {
      await axios.put(`${API}/api/maintenance-schedules/${groupId}`, draft);
      setEditingGroupId(null);
      onSaved();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  if (groups.length === 0) return null;

  return (
    <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
      <SectionLabel>Maintenance windows</SectionLabel>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
        Each asset group can auto-patch on a weekly schedule. Missing updates are deployed
        automatically during the window; "Patch all missing" above still works anytime as a manual override.
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {groups.map((group) => {
          const sched = scheduleFor(group._id);
          const isEditing = editingGroupId === group._id;

          return (
            <div
              key={group._id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 14px",
                borderRadius: 8,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
                <span style={{ fontSize: 15 }}>{group.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{group.name}</span>
              </div>

              {!isEditing && (
                <>
                  <div style={{ fontSize: 12.5, color: sched?.enabled ? "hsl(145,55%,38%)" : "var(--muted)", flex: 1 }}>
                    {sched?.enabled
                      ? `Every ${DAY_NAMES[sched.dayOfWeek]} at ${String(sched.hour).padStart(2, "0")}:${String(sched.minute).padStart(2, "0")}`
                      : "No schedule set"}
                  </div>
                  {isAdmin && (
                    <ActionButton variant="subtle" onClick={() => startEdit(group)}>
                      {sched?.enabled ? "Edit" : "Set schedule"}
                    </ActionButton>
                  )}
                </>
              )}

              {isEditing && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                    />
                    Enabled
                  </label>
                  <select
                    className="input"
                    style={{ fontSize: 12.5, padding: "5px 8px" }}
                    value={draft.dayOfWeek}
                    onChange={(e) => setDraft((d) => ({ ...d, dayOfWeek: Number(e.target.value) }))}
                  >
                    {DAY_NAMES.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    style={{ fontSize: 12.5, padding: "5px 8px" }}
                    value={draft.hour}
                    onChange={(e) => setDraft((d) => ({ ...d, hour: Number(e.target.value) }))}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                  <ActionButton variant="primary" disabled={saving} onClick={() => handleSave(group._id)}>
                    {saving ? "Saving…" : "Save"}
                  </ActionButton>
                  <ActionButton variant="subtle" onClick={() => setEditingGroupId(null)}>
                    Cancel
                  </ActionButton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Backlog() {
  const { user } = useAuth();
  const canPatch = user?.role === "admin" || user?.role === "patch-operator";
  const isAdmin = user?.role === "admin";

  const [rows, setRows] = useState([]);
  const [overviewRows, setOverviewRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [groupFilter, setGroupFilter] = useState("All");
  const [groupPatching, setGroupPatching] = useState(false);
  const [groupPatchResult, setGroupPatchResult] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [osFilter, setOsFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [slaFilter, setSlaFilter] = useState("All");
  const [expanded, setExpanded] = useState(() => new Set());

  async function load() {
    try {
      setErr("");
      const [backlogRes, overviewRes, groupsRes, schedulesRes] = await Promise.all([
        axios.get(`${API}/api/dashboard/patches/backlog`),
        axios.get(`${API}/api/assets/overview`),
        axios.get(`${API}/api/groups`).catch(() => ({ data: { data: [] } })),
        axios.get(`${API}/api/maintenance-schedules`).catch(() => ({ data: { data: [] } })),
      ]);
      setRows(backlogRes.data?.data || []);
      setOverviewRows(overviewRes.data?.data || []);
      setGroups(groupsRes.data?.data || []);
      setSchedules((schedulesRes.data?.data || []).map((s) => ({ ...s, groupId: String(s.groupId) })));
    } catch (e) {
      setErr(e?.message || "Failed to load");
    }
  }

useEffect(() => {
    load();
  }, []);

  // While anything is actively queued/running, keep re-fetching so each
  // item's real state (queued -> running -> done/failed) becomes visible
  // live, instead of only updating on a manual refresh -- reusing the
  // same activeCommand data the backend already attaches per item.
  useEffect(() => {
    const hasActiveWork = grouped.some((g) =>
      Object.values(g.activeCommands || {}).some((c) => c.status === "pending" || c.status === "running"),
    );
    if (!hasActiveWork) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [grouped]);

  const riskByHost = useMemo(() => {
    const map = new Map();
    for (const r of overviewRows) {
      map.set(r.hostname, { score: r?.risk?.score ?? null, priority: r?.risk?.priority ?? "Low" });
    }
    return map;
  }, [overviewRows]);

  const roleByHost = useMemo(() => {
    const map = new Map();
    for (const r of overviewRows) {
      map.set(r.hostname, r?.meta?.role || "workstation");
    }
    return map;
  }, [overviewRows]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const hostname = r.hostname || "unknown";
      const os = (r.os || "-").toLowerCase();
      const collectedAt = r.collectedAt || null;
      const missingItem = normalizeMissingItem(r.missingItem);

      if (!map.has(hostname)) {
        const risk = riskByHost.get(hostname) || { score: null, priority: "Low" };
        map.set(hostname, {
          hostname,
          os,
          role: roleByHost.get(hostname) || "workstation",
          latestCollectedAt: collectedAt,
          missingItems: new Set(),
          riskPriority: risk.priority,
          riskScore: risk.score,
          pendingRestart: r.pendingRestart || [],
          activeCommands: {},
        });
      }

      const g = map.get(hostname);
      if ((g.os === "-" || !g.os) && os) g.os = os;
      if (collectedAt) {
        const cur = g.latestCollectedAt ? new Date(g.latestCollectedAt).getTime() : 0;
        const nxt = new Date(collectedAt).getTime();
        if (nxt > cur) g.latestCollectedAt = collectedAt;
      }
       if (missingItem) {
        g.missingItems.add(missingItem);
        if (r.missingTitle) g.titleByKB = { ...(g.titleByKB || {}), [missingItem]: r.missingTitle };
      }
      if (r.activeCommand) {
        const pkgName = missingItem.split("/")[0].trim();
        g.activeCommands[pkgName] = r.activeCommand;
      }
    }

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        missingCount: g.missingItems.size,
        missingList: Array.from(g.missingItems).sort((a, b) => a.localeCompare(b)),
        sla: getSLAStatus(g.riskPriority, g.latestCollectedAt),
      }))
      .sort((a, b) => {
        const pr = rankPriority(b.riskPriority) - rankPriority(a.riskPriority);
        if (pr !== 0) return pr;
        if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount;
        return (a.hostname || "").localeCompare(b.hostname || "");
      });
  }, [rows, riskByHost, roleByHost]);

  const selectedGroup = useMemo(() => groups.find((gr) => gr._id === groupFilter) || null, [groups, groupFilter]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return grouped.filter((g) => {
      if (qq && !(g.hostname || "").toLowerCase().includes(qq)) return false;
      if (osFilter !== "All" && (g.os || "").toLowerCase() !== osFilter.toLowerCase()) return false;
      if (riskFilter !== "All" && g.riskPriority !== riskFilter) return false;
      if (slaFilter !== "All" && g.sla?.status !== slaFilter) return false;
      if (selectedGroup && !selectedGroup.members.includes(g.hostname)) return false;
      return true;
    });
  }, [grouped, q, osFilter, riskFilter, slaFilter, selectedGroup]);

  async function handlePatchGroup() {
    if (!selectedGroup) return;
    if (
      !window.confirm(
        `Deploy all missing patches across every machine in "${selectedGroup.name}" (${selectedGroup.members.length} machine${selectedGroup.members.length !== 1 ? "s" : ""})?\n\nMachines are patched one at a time.`,
      )
    )
      return;
    setGroupPatching(true);
    setGroupPatchResult("");
    try {
      const res = await axios.post(`${API}/api/groups/${selectedGroup._id}/patch-all`);
      setGroupPatchResult(res.data?.message || "Done");
      load();
    } catch (e) {
      setGroupPatchResult(e?.response?.data?.error || e.message);
    } finally {
      setGroupPatching(false);
      setTimeout(() => setGroupPatchResult(""), 8000);
    }
  }

  function toggle(hostname) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(hostname)) next.delete(hostname);
      else next.add(hostname);
      return next;
    });
  }

  function exportCSV() {
    const header = ["hostname", "os", "riskPriority", "riskScore", "missingCount", "collectedAt", "missingItems"];
    const lines = [header.join(",")];
    for (const g of filtered) {
      lines.push(
        [g.hostname, g.os, g.riskPriority, g.riskScore ?? "", g.missingCount, g.latestCollectedAt || "", g.missingList.join(" | ")]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "patch_backlog.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const breached = grouped.filter((g) => g.sla?.status === "breached").length;
  const dueSoon = grouped.filter((g) => g.sla?.status === "due_soon").length;
  const compliant = grouped.filter((g) => g.sla?.status === "ok").length;

  return (
    <Layout title="Patch Backlog">
      {err && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 16,
            background: "hsla(350,75%,50%,0.08)",
            border: "1px solid hsla(350,75%,50%,0.25)",
            color: "hsl(350,75%,45%)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {/* ── SLA summary ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: "breached", label: "SLA breached", value: breached, color: "hsl(350,75%,50%)" },
          { key: "due_soon", label: "Due within 24h", value: dueSoon, color: "hsl(30,90%,45%)" },
          { key: "ok", label: "Within SLA", value: compliant, color: "hsl(145,55%,38%)" },
        ].map(({ key, label, value, color }) => (
          <div
            key={key}
            onClick={() => setSlaFilter((f) => (f === key ? "All" : key))}
            style={{
              ...cardStyle,
              flex: 1,
              minWidth: 150,
              padding: "16px 18px",
              cursor: "pointer",
              borderColor: slaFilter === key ? color : "var(--panel-border)",
            }}
          >
            <SectionLabel>{label}</SectionLabel>
            <div style={{ fontSize: 26, fontWeight: 800, color: value > 0 ? color : "var(--text)" }}>{value}</div>
          </div>
        ))}
        <div style={{ ...cardStyle, flex: 2, minWidth: 220, padding: "16px 18px" }}>
          <SectionLabel>SLA thresholds</SectionLabel>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {[["Critical", "48h"], ["High", "7d"], ["Medium", "30d"], ["Low", "90d"]].map(([p, t]) => (
              <div key={p} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span className={`badge ${p.toLowerCase()}`} style={{ fontSize: 9 }}>{p}</span>
                <span style={{ color: "var(--muted)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Maintenance windows ── */}
      <MaintenancePanel groups={groups} schedules={schedules} isAdmin={isAdmin} onSaved={load} />

      {/* ── Filters + group action toolbar ── */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            placeholder="Search hostname…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select className="input" value={osFilter} onChange={(e) => setOsFilter(e.target.value)} style={{ minWidth: 120 }}>
            <option value="All">All OS</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
          <select className="input" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={{ minWidth: 130 }}>
            <option value="All">All risk</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          {groups.length > 0 && (
            <select className="input" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={{ minWidth: 160 }}>
              <option value="All">All groups</option>
              {groups.map((gr) => (
                <option key={gr._id} value={gr._id}>{gr.icon} {gr.name} ({gr.members.length})</option>
              ))}
            </select>
          )}
          <div style={{ flex: 1 }} />
          <ActionButton onClick={load}>Refresh</ActionButton>
          <ActionButton onClick={exportCSV}>Export CSV</ActionButton>
        </div>

        {isAdmin && selectedGroup && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {selectedGroup.icon} {selectedGroup.name} — {selectedGroup.members.length} machine{selectedGroup.members.length !== 1 ? "s" : ""}
            </span>
            <ActionButton variant="primary" disabled={groupPatching || selectedGroup.members.length === 0} onClick={handlePatchGroup}>
              {groupPatching ? "Patching group…" : `Patch all missing in ${selectedGroup.name}`}
            </ActionButton>
            {groupPatchResult && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{groupPatchResult}</span>}
          </div>
        )}
      </div>

      {/* ── Machine table ── */}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Hostname</th>
              <th>OS</th>
              <th>Risk</th>
              <th>SLA</th>
              <th>Missing</th>
              <th>Collected</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => {
              const isOpen = expanded.has(g.hostname);
              const preview = g.missingList.slice(0, 3).join(", ");
              const more = g.missingCount > 3 ? ` +${g.missingCount - 3} more` : "";
              const isWin = (g.os || "").toLowerCase() === "windows";
              const isLin = (g.os || "").toLowerCase() === "linux";

              return (
                <>
                  <tr key={g.hostname}>
                    <td>
                      <button
                        onClick={() => toggle(g.hostname)}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          border: "1px solid var(--line)",
                          background: "var(--surface)",
                          cursor: "pointer",
                          fontSize: 14,
                          color: "var(--muted)",
                          lineHeight: 1,
                        }}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>
                    <td style={{ fontWeight: 600 }}>{g.hostname}</td>
                    <td style={{ fontSize: 13 }}>{g.os}</td>
                    <td>
                      <span className={`badge ${(g.riskPriority || "Low").toLowerCase()}`}>
                        {g.riskPriority}{typeof g.riskScore === "number" ? ` (${g.riskScore})` : ""}
                      </span>
                    </td>
                    <td>
                      {g.sla && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "3px 9px",
                            borderRadius: 5,
                            background: `${g.sla.color}14`,
                            color: g.sla.color,
                            border: `1px solid ${g.sla.color}33`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.sla.label}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700 }}>{g.missingCount}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{toLocal(g.latestCollectedAt)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {g.missingCount === 0 ? "—" : `${preview}${more}`}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr key={`${g.hostname}-details`}>
                      <td></td>
                      <td colSpan={7}>
                        <div style={{ padding: "14px 0" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 14,
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                              Missing items ({g.missingCount})
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <PatchAllButton hostname={g.hostname} missingCount={g.missingCount} canPatch={canPatch} onDone={load} />
                              {isLin && <AptUpdateButton hostname={g.hostname} canPatch={canPatch} />}
                            </div>
                          </div>

                          {g.missingCount === 0 ? (
                            <div className="muted" style={{ fontSize: 13 }}>No missing patches.</div>
                          ) : (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                                gap: 8,
                              }}
                            >
                              {g.missingList.map((item) => (
                                <div
                                  key={`${g.hostname}-${item}`}
                                  style={{
                                    border: "1px solid var(--line)",
                                    borderRadius: 8,
                                    padding: "9px 13px",
                                    background: "var(--surface)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                 <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                      style={{
                                        fontSize: 12.5,
                                        fontWeight: 500,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {item}
                                    </div>
                                    {g.titleByKB?.[item] && (
                                      <div
                                        style={{
                                          fontSize: 11,
                                          color: "var(--muted)",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {g.titleByKB[item]}
                                      </div>
                                    )}
                                  </div>
                                  <PatchNowButton
                                    hostname={g.hostname}
                                    pkg={item}
                                    os={g.os}
                                    role={g.role}
                                    onPatched={load}
                                    alreadyQueued={(g.pendingRestart || []).includes(item)}
                                    activeCommand={g.activeCommands[item.split("/")[0].trim()]}
                                    canPatch={canPatch}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
