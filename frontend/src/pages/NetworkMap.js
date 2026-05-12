import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const EXPOSURE_CONFIG = {
  internet: { label: "Internet Facing", color: "hsl(350,100%,65%)", bg: "hsla(350,100%,65%,0.12)", border: "hsla(350,100%,65%,0.4)", multiplier: "1.0×", icon: "🌐" },
  dmz:      { label: "DMZ",            color: "hsl(25,100%,60%)",  bg: "hsla(25,100%,60%,0.12)",  border: "hsla(25,100%,60%,0.4)",  multiplier: "0.8×", icon: "🔶" },
  internal: { label: "Internal",       color: "hsl(210,80%,60%)",  bg: "hsla(210,80%,60%,0.12)",  border: "hsla(210,80%,60%,0.4)",  multiplier: "0.5×", icon: "🏢" },
  isolated: { label: "Isolated",       color: "hsl(130,60%,50%)",  bg: "hsla(130,60%,50%,0.12)",  border: "hsla(130,60%,50%,0.4)",  multiplier: "0.2×", icon: "🔒" },
};

const ZONE_CONFIG = {
  internet: { label: "Internet Zone",     color: "hsl(350,100%,65%)", description: "Directly reachable from the public internet" },
  dmz:      { label: "DMZ",              color: "hsl(25,100%,60%)",  description: "Partially exposed — perimeter network" },
  staff:    { label: "Staff Network",     color: "hsl(45,100%,55%)",  description: "10.10.10.0/24 — HQ Staff endpoints" },
  servers:  { label: "Servers Network",   color: "hsl(210,80%,60%)",  description: "10.10.20.0/24 — Core infrastructure" },
  isolated: { label: "Isolated",          color: "hsl(130,60%,50%)",  description: "Air-gapped or restricted access" },
};

const RISK_COLOR = p => ({ Critical: "hsl(350,100%,65%)", High: "hsl(25,100%,60%)", Medium: "hsl(45,100%,50%)", Low: "hsl(130,60%,50%)" }[p] || "var(--muted)");

// ── Asset Card in the map ─────────────────────────────────────────────────────
function AssetCard({ asset, agentStatus, riskData, onChangeExposure, isAdmin }) {
  const navigate     = useNavigate();
  const exp          = EXPOSURE_CONFIG[asset.exposureLevel] || EXPOSURE_CONFIG.internal;
  const status       = agentStatus[asset.hostname];
  const risk         = riskData[asset.hostname];
  const isOnline     = status === "active";
  const isUnknown    = !status;

  return (
    <div
      style={{
        background: "var(--panel)", border: `1px solid ${exp.border}`,
        borderRadius: 12, padding: "14px 16px", cursor: "pointer",
        transition: "transform 0.15s, box-shadow 0.15s",
        boxShadow: `0 2px 8px rgba(0,0,0,0.2)`,
        minWidth: 200, maxWidth: 240,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 6px 20px rgba(0,0,0,0.3), 0 0 0 1px ${exp.color}`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"; }}
      onClick={() => navigate(`/asset/${encodeURIComponent(asset.hostname)}`)}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{asset.hostname}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{asset.os_type || "unknown"}</div>
        </div>
        {/* Online/Offline dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isOnline ? "hsl(130,60%,50%)" : isUnknown ? "var(--muted)" : "hsl(350,100%,65%)",
            boxShadow: isOnline ? "0 0 6px hsl(130,60%,50%)" : "none",
          }} />
          <span style={{ fontSize: 10, color: "var(--muted)" }}>
            {isOnline ? "Online" : isUnknown ? "Unknown" : "Offline"}
          </span>
        </div>
      </div>

      {/* Exposure badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
        background: exp.bg, color: exp.color, border: `1px solid ${exp.border}`,
        marginBottom: 10,
      }}>
        <span>{exp.icon}</span>
        <span>{exp.label}</span>
        <span style={{ opacity: 0.7 }}>({exp.multiplier})</span>
      </div>

      {/* Risk score */}
      {risk && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Risk Score</div>
          <div style={{
            fontSize: 13, fontWeight: 900, color: RISK_COLOR(risk.priority),
            background: `${RISK_COLOR(risk.priority)}18`, padding: "2px 8px",
            borderRadius: 4, border: `1px solid ${RISK_COLOR(risk.priority)}44`,
          }}>
            {risk.priority} ({risk.score})
          </div>
        </div>
      )}

      {/* Role */}
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
        Role: <span style={{ color: "var(--text)" }}>{(asset.role || "unknown").replace("_", " ")}</span>
      </div>

      {/* Change exposure button — admin only */}
      {isAdmin && (
        <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
          <select
            className="input"
            style={{ fontSize: 10, padding: "4px 6px", width: "100%" }}
            value={asset.exposureLevel || "internal"}
            onChange={e => onChangeExposure(asset.hostname, e.target.value)}
          >
            <option value="internet">🌐 Internet Facing</option>
            <option value="dmz">🔶 DMZ</option>
            <option value="internal">🏢 Internal</option>
            <option value="isolated">🔒 Isolated</option>
          </select>
        </div>
      )}
    </div>
  );
}

// ── Zone Container ────────────────────────────────────────────────────────────
function NetworkZone({ zoneKey, assets, agentStatus, riskData, onChangeExposure, isAdmin }) {
  const zone = ZONE_CONFIG[zoneKey];
  if (!assets || assets.length === 0) return null;

  return (
    <div style={{
      border: `1px solid ${zone.color}44`,
      borderRadius: 16, padding: "20px 24px",
      background: `${zone.color}06`,
      position: "relative",
    }}>
      {/* Zone label */}
      <div style={{
        position: "absolute", top: -12, left: 20,
        background: "var(--bg)", padding: "2px 12px",
        borderRadius: 6, border: `1px solid ${zone.color}66`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: zone.color }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: zone.color }}>{zone.label}</span>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>{zone.description}</span>
      </div>

      {/* Asset cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        {assets.map(asset => (
          <AssetCard
            key={asset.hostname}
            asset={asset}
            agentStatus={agentStatus}
            riskData={riskData}
            onChangeExposure={onChangeExposure}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NetworkMap() {
  const [metas, setMetas]           = useState([]);
  const [agentStatus, setStatus]    = useState({});
  const [riskData, setRiskData]     = useState({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(null);
  const { user }                    = (() => { try { return require("../context/AuthContext").useAuth(); } catch { return { user: null }; } })();

  // Use useAuth properly
  const [role, setRole] = useState("analyst");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [metaRes, agentRes, overviewRes] = await Promise.all([
        axios.get(`${API}/api/meta/all`),
        axios.get(`${API}/api/agents`).catch(() => ({ data: { data: [] } })),
        axios.get(`${API}/api/assets/overview`).catch(() => ({ data: { data: [] } })),
      ]);

      setMetas(metaRes.data?.data || []);

      // Build agent status map
      const statusMap = {};
      for (const a of (agentRes.data?.data || [])) statusMap[a.hostname] = a.status;
      setStatus(statusMap);

      // Build risk map
      const riskMap = {};
      for (const a of (overviewRes.data?.data || [])) {
        if (a.risk) riskMap[a.hostname] = a.risk;
      }
      setRiskData(riskMap);
    } catch (e) {
      console.error("NetworkMap load error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleChangeExposure(hostname, newLevel) {
    setSaving(hostname);
    try {
      const zoneMap = { internet: "internet", dmz: "dmz", internal: "servers", isolated: "isolated" };
      await axios.patch(`${API}/api/meta/${hostname}/exposure`, {
        exposureLevel: newLevel,
        networkZone: zoneMap[newLevel] || "servers",
      });
      setMetas(prev => prev.map(m => m.hostname === hostname ? { ...m, exposureLevel: newLevel, networkZone: zoneMap[newLevel] || "servers" } : m));
    } catch (e) {
      console.error("Exposure update error:", e);
    } finally {
      setSaving(null);
    }
  }

  // Group assets by networkZone
  const zoneGroups = {};
  for (const meta of metas) {
    const zone = meta.networkZone || "servers";
    if (!zoneGroups[zone]) zoneGroups[zone] = [];
    zoneGroups[zone].push(meta);
  }

  // Zone render order — top to bottom represents internet → internal
  const zoneOrder = ["internet", "dmz", "staff", "servers", "isolated"];

  // Stats
  const internetFacing = metas.filter(m => m.exposureLevel === "internet").length;
  const dmzCount       = metas.filter(m => m.exposureLevel === "dmz").length;
  const internalCount  = metas.filter(m => m.exposureLevel === "internal").length;

  return (
    <Layout title="Network Map">
      {/* Header stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Internet Facing", value: internetFacing, color: "hsl(350,100%,65%)", icon: "🌐" },
          { label: "DMZ Assets", value: dmzCount, color: "hsl(25,100%,60%)", icon: "🔶" },
          { label: "Internal Assets", value: internalCount, color: "hsl(210,80%,60%)", icon: "🏢" },
          { label: "Total Monitored", value: metas.length, color: "var(--accent)", icon: "📡" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="card" style={{ flex: 1, minWidth: 140, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              {icon} {label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
          </div>
        ))}

        {/* Exposure multiplier legend */}
        <div className="card" style={{ flex: 2, minWidth: 240, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Exposure Risk Multiplier
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(EXPOSURE_CONFIG).map(([key, cfg]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                  background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                }}>{cfg.icon} {cfg.label}</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{cfg.multiplier}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="muted">Loading network map...</div>}

      {!loading && (
        <>
          {/* Network diagram — zones stacked top to bottom */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Internet boundary indicator */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 20px", borderRadius: 8,
              background: "hsla(350,100%,65%,0.05)",
              border: "1px dashed hsla(350,100%,65%,0.3)",
            }}>
              <div style={{ fontSize: 18 }}>🌍</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(350,100%,65%)" }}>Internet / Public Network</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Attack surface visible to external threats — exposure multiplier 1.0×</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
                pfSense NAT: 192.168.56.2 → internal hosts
              </div>
            </div>

            {/* pfSense firewall indicator */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 16, padding: "12px",
            }}>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              <div style={{
                padding: "8px 20px", borderRadius: 8,
                background: "var(--panel)", border: "1px solid var(--line)",
                fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>🔥</span>
                <span>pfSense Firewall</span>
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>192.168.56.2 · Stateful Inspection · NAT</span>
              </div>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>

            {/* Zone groups */}
            {zoneOrder.map(zone => (
              zoneGroups[zone] ? (
                <NetworkZone
                  key={zone}
                  zoneKey={zone}
                  assets={zoneGroups[zone]}
                  agentStatus={agentStatus}
                  riskData={riskData}
                  onChangeExposure={handleChangeExposure}
                  isAdmin={true}
                />
              ) : null
            ))}

            {/* Infrastructure nodes (non-monitored) */}
            <div style={{
              border: "1px solid var(--line)", borderRadius: 16, padding: "20px 24px",
              background: "var(--surface)", position: "relative",
            }}>
              <div style={{
                position: "absolute", top: -12, left: 20,
                background: "var(--bg)", padding: "2px 12px",
                borderRadius: 6, border: "1px solid var(--line)",
                fontSize: 12, fontWeight: 700, color: "var(--muted)",
              }}>Infrastructure (Monitoring & Management)</div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
                {[
                  { name: "PATCH-SRV", ip: "10.10.20.30", role: "Backend + MongoDB + Collectors", icon: "⚙️" },
                  { name: "Wazuh Manager", ip: "10.10.20.20", role: "SIEM + OpenSearch + SCA", icon: "👁️" },
                ].map(node => (
                  <div key={node.name} style={{
                    background: "var(--panel)", border: "1px solid var(--line)",
                    borderRadius: 12, padding: "14px 16px", minWidth: 200,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{node.icon} {node.name}</div>
                    <div style={{ fontSize: 11, color: "hsl(210,80%,60%)" }}>{node.ip}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{node.role}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Refresh button */}
          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn" onClick={load} style={{ fontSize: 12 }}>
              🔄 Refresh Map
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}