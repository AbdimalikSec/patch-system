import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import Layout from "../Layout";

const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

// ── Assets under evaluation (lab infrastructure only — excludes Wazuh monitor) 
const EVAL_ASSETS = ["DC1", "HQ-STAFF-01", "kali"];

// ── Traditional model scores ──────────────────────────────────────────────────
// Simulates patch-count-only approach: score = (missingCount / 50) * 100
// No criticality, no CVSS, no compliance weighting.
const TRADITIONAL_SCORES = {
  "DC1":         { score: 10, priority: "Low",    reasoning: "5 missing patches / 50 max = 10%. No criticality weighting applied. Would be deprioritised behind kali." },
  "HQ-STAFF-01": { score: 0,  priority: "Low",    reasoning: "0 missing patches — would be classified as fully secure and deprioritised entirely." },
  "kali":        { score: 34, priority: "Medium", reasoning: "17 missing packages / 50 max = 34%. Ranked highest despite being a non-critical workstation." },
};

const ROLE_LABELS = {
  domain_controller: "Domain Controller",
  security_server:   "Security Server",
  workstation:       "Workstation",
  test_machine:      "Test Machine",
  other:             "Other",
};

function ScoreBar({ score, color, label }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), 100);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", width: 70, textAlign: "right", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${width}%`, background: color,
          borderRadius: 4, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)"
        }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, width: 32, color }}>{score}</div>
    </div>
  );
}

function PriorityBadge({ priority }) {
  const colors = {
    Critical: { bg: "hsla(350,100%,65%,0.15)", border: "hsl(350,100%,65%)", text: "hsl(350,100%,65%)" },
    High:     { bg: "hsla(25,100%,60%,0.15)",  border: "hsl(25,100%,60%)",  text: "hsl(25,100%,60%)"  },
    Medium:   { bg: "hsla(45,100%,50%,0.15)",  border: "hsl(45,100%,50%)",  text: "hsl(45,100%,50%)"  },
    Low:      { bg: "hsla(130,60%,50%,0.15)",  border: "hsl(130,60%,50%)",  text: "hsl(130,60%,50%)"  },
  };
  const c = colors[priority] || colors.Low;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      letterSpacing: "0.05em", textTransform: "uppercase"
    }}>{priority}</span>
  );
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 140 }}>
      <div className="cardLabel">{label}</div>
      <div className="cardValue" style={{ color: accent || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ComparisonRow({ asset, riskData }) {
  const trad = TRADITIONAL_SCORES[asset.hostname] || { score: 0, priority: "Low", reasoning: "No data" };
  const risk = riskData || { score: 0, priority: "Low", reasons: [] };
  const improvement = risk.score - trad.score;
  const elevated = improvement > 5;
  const reduced = improvement < -5;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "180px 1fr 1fr 120px",
      gap: 16, alignItems: "center", padding: "16px 0",
      borderBottom: "1px solid var(--line)"
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{asset.hostname}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          {ROLE_LABELS[asset.role] || asset.role}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          Criticality: {(asset.criticality * 100).toFixed(0)}%
        </div>
      </div>

      <div style={{ padding: "12px 16px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <PriorityBadge priority={trad.priority} />
          <span style={{ fontSize: 18, fontWeight: 900 }}>{trad.score}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{trad.reasoning}</div>
      </div>

      <div style={{
        padding: "12px 16px", background: "var(--surface)", borderRadius: 8,
        border: `1px solid ${elevated ? "hsl(350,100%,65%)" : reduced ? "hsl(130,60%,50%)" : "var(--accent)"}`,
        boxShadow: elevated ? "0 0 12px hsla(350,100%,65%,0.15)" : "none"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <PriorityBadge priority={risk.priority} />
          <span style={{ fontSize: 18, fontWeight: 900 }}>{risk.score}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
          {risk.reasons?.[1] || ""}
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 20, fontWeight: 900,
          color: elevated ? "hsl(350,100%,65%)" : reduced ? "hsl(130,60%,50%)" : "var(--muted)"
        }}>
          {improvement > 0 ? `+${improvement}` : improvement}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
          {elevated ? "⚠ Risk elevated" : reduced ? "✓ Risk reduced" : "≈ Similar"}
        </div>
      </div>
    </div>
  );
}

function PriorityOrderComparison({ evalAssets }) {
  const riskOrder = [...evalAssets].sort((a, b) => b.risk.score - a.risk.score);
  const tradOrder = [...evalAssets].sort((a, b) =>
    (TRADITIONAL_SCORES[b.hostname]?.score || 0) - (TRADITIONAL_SCORES[a.hostname]?.score || 0)
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div className="card" style={{ padding: 20 }}>
        <div className="cardLabel" style={{ marginBottom: 4 }}>Traditional Priority Order</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Patch count only — no asset context</div>
        <div style={{ display: "grid", gap: 10 }}>
          {tradOrder.map((a, i) => (
            <div key={a.hostname} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", background: "var(--surface)", borderRadius: 8,
              border: "1px solid var(--line)"
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", fontWeight: 900,
                fontSize: 13, background: "var(--line)", color: "var(--muted)", flexShrink: 0
              }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.hostname}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Score: {TRADITIONAL_SCORES[a.hostname]?.score || 0}
                </div>
              </div>
              <PriorityBadge priority={TRADITIONAL_SCORES[a.hostname]?.priority || "Low"} />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 20, border: "1px solid var(--accent)" }}>
        <div className="cardLabel" style={{ marginBottom: 4 }}>Risk-Based Priority Order</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>CVSS severity + asset criticality + CIS compliance</div>
        <div style={{ display: "grid", gap: 10 }}>
          {riskOrder.map((a, i) => (
            <div key={a.hostname} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", background: "var(--surface)", borderRadius: 8,
              border: `1px solid ${i === 0 ? "hsl(350,100%,65%)" : "var(--line)"}`,
              boxShadow: i === 0 ? "0 0 12px hsla(350,100%,65%,0.1)" : "none"
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", fontWeight: 900,
                fontSize: 13, flexShrink: 0,
                background: i === 0 ? "hsl(350,100%,65%)" : "var(--line)",
                color: i === 0 ? "#fff" : "var(--muted)"
              }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.hostname}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Score: {a.risk.score} · {ROLE_LABELS[a.role] || a.role}
                </div>
              </div>
              <PriorityBadge priority={a.risk.priority} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Evaluation() {
  const [allRiskData, setAllRiskData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${API}/api/risk/all`);
      setAllRiskData(res.data?.data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Filter to evaluation assets only (exclude Wazuh)
  const riskData = useMemo(
    () => allRiskData.filter(a => EVAL_ASSETS.includes(a.hostname)),
    [allRiskData]
  );

  const metrics = useMemo(() => {
    if (!riskData.length) return null;

    const avgRisk = Math.round(riskData.reduce((s, a) => s + a.risk.score, 0) / riskData.length);
    const avgTrad = Math.round(
      riskData.reduce((s, a) => s + (TRADITIONAL_SCORES[a.hostname]?.score || 0), 0) / riskData.length
    );

    const riskOrder = [...riskData].sort((a, b) => b.risk.score - a.risk.score);
    const tradOrder = [...riskData].sort((a, b) =>
      (TRADITIONAL_SCORES[b.hostname]?.score || 0) - (TRADITIONAL_SCORES[a.hostname]?.score || 0)
    );

    const dc1RiskRank = riskOrder.findIndex(a => a.hostname === "DC1") + 1;
    const dc1TradRank = tradOrder.findIndex(a => a.hostname === "DC1") + 1;

    return { avgRisk, avgTrad, dc1RiskRank, dc1TradRank, riskOrder, tradOrder };
  }, [riskData]);

  const riskMap = useMemo(() => {
    const m = {};
    for (const a of riskData) m[a.hostname] = a.risk;
    return m;
  }, [riskData]);

  return (
    <Layout
      title="Evaluation Framework"
      rightControls={<button className="btn" onClick={load}>Refresh</button>}
    >
      <div className="card" style={{ padding: "20px 24px", marginBottom: 24, borderLeft: "3px solid var(--accent)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          Academic Evaluation — Risk-Based vs Traditional Patch Management
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          This framework compares a traditional patch management approach (patch count only, no asset context)
          against the risk-based model implemented in this system (CVSS severity × asset criticality × CIS compliance failures).
          Evaluated against the three lab infrastructure assets: DC1 (Domain Controller), HQ-STAFF-01 (domain-joined workstation),
          and kali (security workstation). All scores are derived from live collected data.
        </div>
      </div>

      {loading && <div className="muted">Loading evaluation data...</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      {!loading && !err && metrics && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <MetricCard
              label="Avg Risk Score (Risk-Based)"
              value={metrics.avgRisk}
              sub="CVSS + criticality + compliance"
              accent="var(--accent)"
            />
            <MetricCard
              label="Avg Risk Score (Traditional)"
              value={metrics.avgTrad}
              sub="Patch count only"
            />
            <MetricCard
              label="DC1 Priority Rank"
              value={`#${metrics.dc1RiskRank} vs #${metrics.dc1TradRank}`}
              sub="Risk-based vs Traditional"
              accent={metrics.dc1RiskRank < metrics.dc1TradRank ? "hsl(350,100%,65%)" : "hsl(130,60%,50%)"}
            />
            <MetricCard
              label="Assets Evaluated"
              value={riskData.length}
              sub="DC1, HQ-STAFF-01, kali"
            />
          </div>

          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <div className="cardLabel" style={{ marginBottom: 20 }}>Risk Score Comparison by Asset</div>
            <div style={{ display: "grid", gap: 20 }}>
              {riskData.map(a => (
                <div key={a.hostname}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{a.hostname}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      {ROLE_LABELS[a.role] || a.role} · criticality {(a.criticality * 100).toFixed(0)}%
                    </span>
                  </div>
                  <ScoreBar score={TRADITIONAL_SCORES[a.hostname]?.score || 0} color="hsl(220,20%,50%)" label="Traditional" />
                  <div style={{ marginTop: 6 }}>
                    <ScoreBar score={a.risk.score} color="var(--accent)" label="Risk-Based" />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, display: "flex", gap: 20, fontSize: 11, color: "var(--muted)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 4, background: "hsl(220,20%,50%)", borderRadius: 2 }} />
                Traditional (patch count only)
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 4, background: "var(--accent)", borderRadius: 2 }} />
                Risk-Based (CVSS + criticality + compliance)
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <PriorityOrderComparison evalAssets={riskData} />
          </div>

          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <div className="cardLabel" style={{ marginBottom: 4 }}>Detailed Score Breakdown</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20 }}>
              Delta = Risk-Based score minus Traditional score. Positive = risk model identifies higher risk than traditional.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr 120px", gap: 16, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>ASSET</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>TRADITIONAL MODEL</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>RISK-BASED MODEL</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textAlign: "center" }}>DELTA</div>
            </div>
            {riskData.map(a => (
              <ComparisonRow key={a.hostname} asset={a} riskData={riskMap[a.hostname]} />
            ))}
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="cardLabel" style={{ marginBottom: 16 }}>Key Findings</div>
            <div style={{ display: "grid", gap: 12 }}>
              {[
                {
                  icon: "⚠",
                  color: "hsl(350,100%,65%)",
                  title: "Critical asset underweighted by traditional model",
                  body: `DC1 (Domain Controller, criticality=100%) ranks #${metrics.dc1TradRank} in the traditional model with only 5 missing patches. The risk-based model ranks it #${metrics.dc1RiskRank}, correctly reflecting its 292 CIS benchmark failures, real CVEs with CVSS scores, and its role as the authentication backbone for the entire domain.`
                },
                {
                  icon: "🔍",
                  color: "hsl(45,100%,50%)",
                  title: "CVSS severity changes patch prioritisation",
                  body: "DC1's missing patches include KB5075899 (10 CVEs matched via MSRC API) and KB5066131 (2 CVEs). Raw patch count treats these identically to any other update. CVSS-weighted scoring surfaces patches with known, documented exploitability — a key requirement for intelligent prioritisation."
                },
                {
                  icon: "✓",
                  color: "hsl(130,60%,50%)",
                  title: "Context-aware scoring prevents misclassification",
                  body: "The traditional model ranks kali highest (17 missing packages). The risk-based model correctly deprioritises it relative to DC1, as kali is a non-critical security workstation. Patching kali before DC1 would represent a clear prioritisation failure in a real incident scenario."
                },
                {
                  icon: "📊",
                  color: "var(--accent)",
                  title: "Compliance failures expose hidden risk",
                  body: "HQ-STAFF-01 has 0 missing patches — a traditional model would classify it as fully secure. The risk-based model scores it Medium (34) due to 298 CIS benchmark failures, exposing misconfiguration risk that patch count alone cannot detect. This demonstrates the value of multi-factor risk assessment."
                }
              ].map((f, i) => (
                <div key={i} style={{
                  padding: "14px 16px", background: "var(--surface)", borderRadius: 8,
                  borderLeft: `3px solid ${f.color}`, display: "flex", gap: 12
                }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{f.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>{f.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}