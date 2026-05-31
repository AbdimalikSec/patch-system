import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const SLA_HOURS = { Critical: 48, High: 168, Medium: 720, Low: 2160 };

function getSLAStatus(priority, collectedAt) {
  if (!collectedAt || !priority) return null;
  const hours = SLA_HOURS[priority];
  if (!hours) return null;
  const elapsed = (Date.now() - new Date(collectedAt).getTime()) / 3600000;
  const remaining = hours - elapsed;
  if (remaining < 0)
    return {
      status: "breached",
      label: `SLA BREACHED ${Math.abs(Math.floor(remaining / 24))}d ago`,
      color: "hsl(350,100%,65%)",
    };
  if (remaining < 24)
    return {
      status: "due_soon",
      label: `Due in ${Math.round(remaining)}h`,
      color: "hsl(25,100%,60%)",
    };
  return {
    status: "ok",
    label: `${Math.floor(remaining / 24)}d remaining`,
    color: "hsl(130,60%,50%)",
  };
}

function normalizeMissingItem(x) {
  if (x == null) return "";
  return String(x).trim();
}

function toLocal(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function rankPriority(p) {
  return { Critical: 4, High: 3, Medium: 2, Low: 1 }[p] || 0;
}

// ── Patch Now Button ──────────────────────────────────────────────────────────
function PatchNowButton({ hostname, pkg, os, onPatched, alreadyQueued, activeCommand }) {
  const [state, setState] = useState(() => {
    if (activeCommand?.status === "running") return "patching";
    if (activeCommand?.status === "success") return "done";
    if (activeCommand?.status === "failed") return "error";
    return "idle";
  });
  const [output, setOutput] = useState(activeCommand?.output || "");
 

  const isWindows = (os || "").toLowerCase() === "windows";
  const isLinux = (os || "").toLowerCase() === "linux";

  // Only show for supported assets
  if (!isLinux && !isWindows) return null;

  // Windows needs a KB number
  if (isWindows && !pkg.match(/KB\d+/i)) {
    return (
      <span
        style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}
      >
        No KB
      </span>
    );
  }
  
    if (isWindows && alreadyQueued) {
    return (
      <span style={{ fontSize: 10, color: "hsl(45,100%,50%)", fontWeight: 700 }}>
        ⏳ Pending restart
      </span>
    );
  }

  async function handlePatch() {
    const confirmMsg = isWindows
      ? `Verify ${pkg} on ${hostname}?\n\nThis confirms the update is pending. Restart DC1 during maintenance window to apply.`
      : `Patch ${pkg} on ${hostname}?\n\nThis runs: apt-get install --only-upgrade ${pkg.split("/")[0]}`;

    if (!window.confirm(confirmMsg)) return;
    setState("patching");
    setOutput("");
    await new Promise(r => setTimeout(r, 400));

    try {
      const res = await axios.post(`${API}/api/deploy/patch`, {
        hostname,
        package: pkg,
      });

      if (res.data?.ok) {
        setOutput(res.data.output || "");
          if (!isWindows) {
          setState("done");
          setTimeout(() => { setState("idle"); onPatched(); }, 5000);
        } else {
          setState("queued");
          const commandId = res.data.commandId;
          if (commandId) {
            const interval = setInterval(async () => {
              try {
                const statusRes = await axios.get(`${API}/api/agent/commands/status/${commandId}`);
                const cmd = statusRes.data?.command;
                if (cmd?.status === "success") {
                  clearInterval(interval);
                  setState("done");
                  setOutput(`✓ Installed — restart ${hostname} to apply`);
                  setTimeout(() => { setState("idle"); onPatched(); }, 8000);
                } else if (cmd?.status === "failed") {
                  clearInterval(interval);
                  setState("error");
                  setOutput(cmd.output || "Installation failed");
                }
              } catch {}
            }, 10000);
          }
        }
        // Windows stays on "done/queued" — restart required to apply
      } else {
        setState("error");
        setOutput(res.data?.output || res.data?.error || "Unknown error");
      }
    } catch (e) {
      setState("error");
      setOutput(e?.response?.data?.error || e.message);
    }
  }

   if (state === "patching")
    return (
      <span style={{ fontSize: 10, color: "hsl(45,100%,50%)", fontWeight: 700, whiteSpace: "nowrap" }}>
        ⟳ Patching...
      </span>
    );

if (state === "queued")
    return (
      <div>
        <span style={{ fontSize: 10, color: "hsl(210,100%,60%)", fontWeight: 700 }}>
          ⟳ Agent installing...
        </span>
        {output && (
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, maxWidth: 220, wordBreak: "break-word" }}>
            {output.slice(0, 100)}
          </div>
        )}
      </div>
    );

  if (state === "done")
    return (
      <div>
        <span
          style={{ fontSize: 10, color: "hsl(45,100%,50%)", fontWeight: 700 }}
        >
          {isWindows ? "⏳ Pending restart" : "✓ Done"}
        </span>
        {output && (
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginTop: 2,
              maxWidth: 220,
              wordBreak: "break-word",
            }}
          >
            {output.slice(0, 100)}
          </div>
        )}
      </div>
    );

  if (state === "error")
    return (
      <div>
        <span
          style={{ fontSize: 10, color: "hsl(350,100%,65%)", fontWeight: 700 }}
        >
          ✕ Failed
        </span>
        {output && (
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginTop: 2,
              maxWidth: 200,
              wordBreak: "break-word",
            }}
          >
            {output.slice(0, 120)}
          </div>
        )}
      </div>
    );

  return (
    <button
      onClick={handlePatch}
      style={{
        padding: "3px 10px",
        borderRadius: 5,
        fontSize: 11,
        cursor: "pointer",
        background: isWindows
          ? "hsla(210,100%,60%,0.12)"
          : "hsla(130,60%,50%,0.12)",
        border: isWindows
          ? "1px solid hsla(210,100%,60%,0.4)"
          : "1px solid hsla(130,60%,50%,0.4)",
        color: isWindows ? "hsl(210,100%,60%)" : "hsl(130,60%,50%)",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      ▶ Patch Now
    </button>
  );
}

export default function Backlog() {
  const [rows, setRows] = useState([]);
  const [overviewRows, setOverviewRows] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [osFilter, setOsFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [slaFilter, setSlaFilter] = useState("All");
  const [expanded, setExpanded] = useState(() => new Set());

  async function load() {
    try {
      setErr("");
      const [backlogRes, overviewRes] = await Promise.all([
        axios.get(`${API}/api/dashboard/patches/backlog`),
        axios.get(`${API}/api/assets/overview`),
      ]);
      setRows(backlogRes.data?.data || []);
      setOverviewRows(overviewRes.data?.data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const riskByHost = useMemo(() => {
    const map = new Map();
    for (const r of overviewRows) {
      map.set(r.hostname, {
        score: r?.risk?.score ?? null,
        priority: r?.risk?.priority ?? "Low",
      });
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
        const risk = riskByHost.get(hostname) || {
          score: null,
          priority: "Low",
        };
       map.set(hostname, {
          hostname,
          os,
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
        const cur = g.latestCollectedAt
          ? new Date(g.latestCollectedAt).getTime()
          : 0;
        const nxt = new Date(collectedAt).getTime();
        if (nxt > cur) g.latestCollectedAt = collectedAt;
      }
      if (missingItem) g.missingItems.add(missingItem);
      if (r.activeCommand) {
        const pkgName = missingItem.split("/")[0].trim();
        g.activeCommands[pkgName] = r.activeCommand;
      }
    }

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        missingCount: g.missingItems.size,
        missingList: Array.from(g.missingItems).sort((a, b) =>
          a.localeCompare(b),
        ),
        sla: getSLAStatus(g.riskPriority, g.latestCollectedAt),
      }))
      .sort((a, b) => {
        const pr = rankPriority(b.riskPriority) - rankPriority(a.riskPriority);
        if (pr !== 0) return pr;
        if (b.missingCount !== a.missingCount)
          return b.missingCount - a.missingCount;
        return (a.hostname || "").localeCompare(b.hostname || "");
      });
  }, [rows, riskByHost]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return grouped.filter((g) => {
      if (qq && !(g.hostname || "").toLowerCase().includes(qq)) return false;
      if (
        osFilter !== "All" &&
        (g.os || "").toLowerCase() !== osFilter.toLowerCase()
      )
        return false;
      if (riskFilter !== "All" && g.riskPriority !== riskFilter) return false;
      if (slaFilter !== "All" && g.sla?.status !== slaFilter) return false;
      return true;
    });
  }, [grouped, q, osFilter, riskFilter, slaFilter]);

  function toggle(hostname) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(hostname)) next.delete(hostname);
      else next.add(hostname);
      return next;
    });
  }

  function exportCSV() {
    const header = [
      "hostname",
      "os",
      "riskPriority",
      "riskScore",
      "missingCount",
      "collectedAt",
      "missingItems",
    ];
    const lines = [header.join(",")];
    for (const g of filtered) {
      lines.push(
        [
          g.hostname,
          g.os,
          g.riskPriority,
          g.riskScore ?? "",
          g.missingCount,
          g.latestCollectedAt || "",
          g.missingList.join(" | "),
        ]
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

  return (
    <Layout
      title="Patch Backlog"
      rightControls={
        <>
          <input
            className="input"
            placeholder="Search hostname..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            style={{ minWidth: 130 }}
            value={osFilter}
            onChange={(e) => setOsFilter(e.target.value)}
          >
            <option value="All">All OS</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
          <select
            className="input"
            style={{ minWidth: 140 }}
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="All">All Risk</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <button className="btn" onClick={load}>
            Refresh
          </button>
          <button className="btn" onClick={exportCSV}>
            Export CSV
          </button>
          <button className="btn" onClick={() => window.print()}>
            Export PDF
          </button>
        </>
      }
    >
      {err && <div style={{ color: "crimson", marginBottom: 10 }}>{err}</div>}

      {/* SLA KPIs */}
      {(() => {
        const breached = grouped.filter(
          (g) => g.sla?.status === "breached",
        ).length;
        const dueSoon = grouped.filter(
          (g) => g.sla?.status === "due_soon",
        ).length;
        const compliant = grouped.filter((g) => g.sla?.status === "ok").length;
        return (
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            {[
              {
                key: "breached",
                label: "SLA Breached",
                value: breached,
                color: "hsl(350,100%,65%)",
              },
              {
                key: "due_soon",
                label: "Due Within 24h",
                value: dueSoon,
                color: "hsl(25,100%,60%)",
              },
              {
                key: "ok",
                label: "Within SLA",
                value: compliant,
                color: "hsl(130,60%,50%)",
              },
            ].map(({ key, label, value, color }) => (
              <div
                key={key}
                className="card"
                style={{
                  flex: 1,
                  minWidth: 130,
                  padding: "14px 18px",
                  cursor: "pointer",
                  border: slaFilter === key ? `1px solid ${color}` : undefined,
                }}
                onClick={() => setSlaFilter((f) => (f === key ? "All" : key))}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 6,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: value > 0 ? color : "inherit",
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
            <div
              className="card"
              style={{ flex: 2, minWidth: 200, padding: "14px 18px" }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                }}
              >
                SLA Thresholds
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[
                  ["Critical", "48h"],
                  ["High", "7d"],
                  ["Medium", "30d"],
                  ["Low", "90d"],
                ].map(([p, t]) => (
                  <div key={p} style={{ fontSize: 11 }}>
                    <span
                      className={`badge ${p.toLowerCase()}`}
                      style={{ fontSize: 9, marginRight: 4 }}
                    >
                      {p}
                    </span>
                    <span style={{ color: "var(--muted)" }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}></th>
              <th>Hostname</th>
              <th>OS</th>
              <th>Risk</th>
              <th>SLA</th>
              <th>Missing</th>
              <th>Collected At</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => {
              const isOpen = expanded.has(g.hostname);
              const preview = g.missingList.slice(0, 3).join(", ");
              const more =
                g.missingCount > 3 ? ` (+${g.missingCount - 3} more)` : "";
              const isWin = (g.os || "").toLowerCase() === "windows";
              const isLin = (g.os || "").toLowerCase() === "linux";

              return (
                <>
                  <tr key={g.hostname}>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: "6px 10px" }}
                        onClick={() => toggle(g.hostname)}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>
                    <td style={{ fontWeight: 600 }}>{g.hostname}</td>
                    <td>{(g.os || "-").toUpperCase()}</td>
                    <td>
                      <span
                        className={`badge ${(g.riskPriority || "Low").toLowerCase()}`}
                      >
                        {g.riskPriority}
                        {typeof g.riskScore === "number"
                          ? ` (${g.riskScore})`
                          : ""}
                      </span>
                    </td>
                    <td>
                      {g.sla && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 4,
                            background: `${g.sla.color}22`,
                            color: g.sla.color,
                            border: `1px solid ${g.sla.color}44`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.sla.label}
                        </span>
                      )}
                    </td>
                    <td>{g.missingCount}</td>
                    <td className="muted">{toLocal(g.latestCollectedAt)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {g.missingCount === 0 ? "-" : `${preview}${more}`}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr key={`${g.hostname}-details`}>
                      <td></td>
                      <td colSpan={7}>
                        <div style={{ padding: "12px 0" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 10,
                            }}
                          >
                            <div className="muted" style={{ fontSize: 13 }}>
                              Missing items ({g.missingCount})
                            </div>
                            {isLin && g.missingCount > 0 && (
                              <div
                                style={{ fontSize: 11, color: "var(--muted)" }}
                              >
                                ▶{" "}
                                <strong style={{ color: "hsl(130,60%,50%)" }}>
                                  Patch Now
                                </strong>{" "}
                                installs the package directly on {g.hostname}{" "}
                                via SSH
                              </div>
                            )}
                            {isWin && g.missingCount > 0 && (
                              <div
                                style={{ fontSize: 11, color: "var(--muted)" }}
                              >
                                <strong style={{ color: "hsl(210,100%,60%)" }}>
                                  Patch Now
                                </strong>{" "}
                                sends install command to local agent on {g.hostname}
                              </div>
                            )}
                          </div>

                          {g.missingCount === 0 ? (
                            <div className="muted">No missing patches.</div>
                          ) : (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fill, minmax(300px, 1fr))",
                                gap: 8,
                              }}
                            >
                              {g.missingList.map((item) => (
                                <div
                                  key={`${g.hostname}-${item}`}
                                  style={{
                                    border: "1px solid var(--line)",
                                    borderRadius: 8,
                                    padding: "8px 12px",
                                    background: "var(--surface)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 500,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      flex: 1,
                                    }}
                                  >
                                    {item}
                                  </div>
                                  <PatchNowButton
                                    hostname={g.hostname}
                                    pkg={item}
                                    os={g.os}
                                    onPatched={load}
                                    alreadyQueued={(g.pendingRestart || []).includes(item)}
                                    activeCommand={g.activeCommands[item.split("/")[0].trim()]}
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
