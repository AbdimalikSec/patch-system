const router = require("express").Router();

const Patch      = require("../models/Patch");
const Compliance = require("../models/Compliance");
const AssetMeta  = require("../models/AssetMeta");
const CVEMatch   = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");
const { requireAuth } = require("../middleware/authMiddleware");
const Agent = require("../models/Agent");
const { getVulnMatchesForAgent } = require("./vulnerabilities");
// ─────────────────────────────────────────────────────────────────────────────
// RISK ENGINE v4 — CVE/CVSS + Patch Age Integrated
//
// Formula:
//
//   RiskScore = clamp(
//     (W_cvss × CVSSFactor + W_comp × CompFactor) × CriticalityMultiplier × 100,
//     0, 100
//   )
//
// CVSSFactor now includes patch age boost:
//   CVSSFactor = clamp((maxCVSS / 10.0) × AgeFactor, 0, 1)
//
// AgeFactor (based on days since oldest missing patch was first detected):
//   < 7 days   = 1.00 (no boost)
//   7-30 days  = 1.10 (10% boost — patch window opening)
//   30-60 days = 1.20 (20% boost — significant exposure)
//   60-90 days = 1.35 (35% boost — high exposure window)
//   90+ days   = 1.50 (50% boost — critical, likely targeted)
//
// Weight justification (NIST SP 800-30):
//   W_cvss = 0.55
//   W_comp = 0.45
//
// Risk tiers:
//   Critical >= 75
//   High     >= 50
//   Medium   >= 25
//   Low       < 25
// ─────────────────────────────────────────────────────────────────────────────

const W_CVSS    = 0.55;
const W_COMP    = 0.45;
const PATCH_MAX = 50;
const COMP_MAX  = 300;

const EXPOSURE_MULTIPLIER = {
  internet: 1.0,
  dmz:      0.8,
  internal: 0.5,
  isolated: 0.2,
};

// Network exposure multiplier — how reachable is this asset from an attacker?

// Exposure multiplier — scales risk based on network reachability
// internet-facing assets are 2x more dangerous than isolated ones

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hostnameRegex(hostname) {
  return { $regex: new RegExp(`^${hostname}$`, "i") };
}

// ── Patch Age Factor ──────────────────────────────────────────────────────────
function computeAgeFactor(collectedAt) {
  if (!collectedAt) return { factor: 1.0, days: 0, label: "unknown age" };

  const now      = Date.now();
  const patchDate = new Date(collectedAt).getTime();
  const days     = Math.floor((now - patchDate) / (1000 * 60 * 60 * 24));

  let factor;
  let label;

  if (days < 7) {
    factor = 1.0;
    label  = `${days}d old — no age boost`;
  } else if (days < 30) {
    factor = 1.1;
    label  = `${days}d old — +10% age boost (patch window opening)`;
  } else if (days < 60) {
    factor = 1.2;
    label  = `${days}d old — +20% age boost (significant exposure)`;
  } else if (days < 90) {
    factor = 1.35;
    label  = `${days}d old — +35% age boost (high exposure window)`;
  } else {
    factor = 1.5;
    label  = `${days}d old — +50% age boost (critical, likely targeted)`;
  }

  return { factor, days, label };
}

// Exposure multiplier — how reachable is this asset by an attacker
async function computeRisk({ patch, compliance, meta, cveMatches, vulnMatches }) {
  const missingCount    = patch?.missingCount     ?? 0;
  const failedCount     = compliance?.failedCount ?? 0;
  const criticality     = meta?.criticality       ?? 0.5;
  const role            = meta?.role              ?? "workstation";
  const exposureLevel   = meta?.exposureLevel     ?? "internal";
  const exposureMult    = EXPOSURE_MULTIPLIER[exposureLevel] ?? 0.5;

  // ── Exposure Multiplier ───────────────────────────────────────────────────
  // Network exposure amplifies risk — an internet-facing asset with the same
  // vulnerability is far more dangerous than an isolated internal machine.

  // ── Patch Age Factor ──────────────────────────────────────────────────────
  const { factor: ageFactor, days: patchAgeDays, label: ageLabel } =
    computeAgeFactor(patch?.collectedAt);

  // ── CVSSFactor with age boost ─────────────────────────────────────────────
    let cvssSource = "patch_count_fallback";
  let maxCVSS    = 0;
  let cvssCount  = 0;

  if (cveMatches && cveMatches.length > 0) {
    cvssCount = cveMatches.length;
    maxCVSS   = Math.max(...cveMatches.map(c => c.cvssScore || 0));
    cvssSource = `${cvssCount} CVEs from missing patches (max CVSS: ${maxCVSS.toFixed(1)})`;
  }

  // ── Real installed-software vulnerabilities (Wazuh vulnerability scanner) ──
  // These are separate from the patch-derived CVEs above: they're CVEs found
  // directly in installed software (browsers, runtimes, libraries), independent
  // of whether a Windows/apt update is missing. The worse of the two sources
  // drives the CVSS input, since either can represent the real worst-case risk.
  const vulnCount    = vulnMatches ? vulnMatches.length : 0;
  const maxVulnCVSS  = vulnCount > 0 ? Math.max(...vulnMatches.map(v => v.cvssScore || 0)) : 0;
  const vulnCritical = vulnMatches ? vulnMatches.filter(v => (v.severity || "").toLowerCase() === "critical").length : 0;
  const vulnHigh     = vulnMatches ? vulnMatches.filter(v => (v.severity || "").toLowerCase() === "high").length : 0;

  if (maxVulnCVSS > maxCVSS) {
    maxCVSS = maxVulnCVSS;
    cvssSource = `${vulnCount} installed-software vulnerabilities (Wazuh scanner, max CVSS: ${maxVulnCVSS.toFixed(1)})`;
  } else if (vulnCount > 0) {
    cvssSource += ` + ${vulnCount} installed-software vulnerabilities (max CVSS ${maxVulnCVSS.toFixed(1)})`;
  }

  // Volume boost — many critical/high installed-software vulns raise risk even
  // if none individually beats the worst patch-derived CVE. Capped, same
  // pattern as the existing exploit boost below.
  const vulnBoost = 1 + Math.min(vulnCritical, 5) * 0.03 + Math.min(vulnHigh, 5) * 0.015;

  const cvssValue  = maxCVSS > 0 ? maxCVSS : (missingCount / PATCH_MAX) * 10;


  // Apply age factor to CVSS value before normalising
  const cvssAged   = cvssValue * ageFactor;

  // ── Exploit Intelligence Boost ────────────────────────────────────────────
  const exploitCVEs  = cveMatches ? cveMatches.filter(c => c.hasExploit) : [];
  const hasExploits  = exploitCVEs.length > 0;
  // If any matched CVE has a known public exploit, boost CVSS factor by 25%
  const exploitBoost = hasExploits ? 1.25 : 1.0;
  const cvssFactor   = clamp((cvssAged * exploitBoost * vulnBoost) / 10.0, 0, 1);

  // ── ComplianceFactor ──────────────────────────────────────────────────────
  const complianceFactor = clamp(failedCount / COMP_MAX, 0, 1);

  // ── CriticalityMultiplier ─────────────────────────────────────────────────
  const criticalityMultiplier = 0.5 + (criticality * 0.5);

  // ── Final score ───────────────────────────────────────────────────────────
  const baseRisk = (W_CVSS * cvssFactor) + (W_COMP * complianceFactor);
  const score    = clamp(Math.round(baseRisk * criticalityMultiplier * exposureMult * 100), 0, 100);

  // ── Risk tier ─────────────────────────────────────────────────────────────
  let priority;
  if      (score >= 75) priority = "Critical";
  else if (score >= 50) priority = "High";
  else if (score >= 25) priority = "Medium";
  else                  priority = "Low";

  // ── CVE severity breakdown ────────────────────────────────────────────────
  const cveSeverityBreakdown = { Critical: 0, High: 0, Medium: 0, Low: 0, Unknown: 0 };
  if (cveMatches) {
    for (const c of cveMatches) {
      const s = c.severity || "Unknown";
      if (cveSeverityBreakdown[s] !== undefined) cveSeverityBreakdown[s]++;
      else cveSeverityBreakdown.Unknown++;
    }
  }

  // ── Explainable reasons ───────────────────────────────────────────────────
  const reasons = [
    `Asset role: ${role} (criticality=${criticality}, multiplier=${criticalityMultiplier.toFixed(2)})`,
    `Network exposure: ${exposureLevel} (multiplier=${exposureMult}) — ${exposureLevel === 'internet' ? 'directly reachable from internet, highest attack surface' : exposureLevel === 'dmz' ? 'DMZ-protected, partially exposed' : exposureLevel === 'isolated' ? 'isolated network, lowest attack surface' : 'internal network only'}`,

    `CVE data: ${cvssSource}`,
     vulnCount > 0
      ? `Installed-software vulnerabilities: ${vulnCount} found (${vulnCritical} critical, ${vulnHigh} high) → volume boost ×${vulnBoost.toFixed(3)}`
      : `Installed-software vulnerabilities: none found`,
    `Patch age: ${ageLabel}`,
    hasExploits
      ? `⚠️  EXPLOIT ALERT: ${exploitCVEs.length} CVE(s) have known public exploit code — CVSS boosted by 25%`
      : `Exploit intelligence: no known public exploits found`,
    `CVSS factor = (${cvssValue.toFixed(1)} × ${ageFactor} × ${exploitBoost}) / 10 = ${cvssFactor.toFixed(3)} (weight ${W_CVSS})`,
    `CIS failures: ${failedCount} → compliance factor = ${complianceFactor.toFixed(3)} (weight ${W_COMP})`,
    `Base risk = (${W_CVSS} × ${cvssFactor.toFixed(3)}) + (${W_COMP} × ${complianceFactor.toFixed(3)}) = ${baseRisk.toFixed(3)}`,
    `Final score = ${baseRisk.toFixed(3)} × ${criticalityMultiplier.toFixed(2)} × 100 = ${score}`,
  ];

  const breakdown = {
    cvssFactor:            parseFloat(cvssFactor.toFixed(4)),
    complianceFactor:      parseFloat(complianceFactor.toFixed(4)),
    criticalityMultiplier: parseFloat(criticalityMultiplier.toFixed(4)),
    baseRisk:              parseFloat(baseRisk.toFixed(4)),
    maxCVSS,
    cvssCount,
    cvssSource,
    vulnCount,
    maxVulnCVSS,
    vulnCritical,
    vulnHigh,
    vulnBoost: parseFloat(vulnBoost.toFixed(4)),
    ageFactor,
    patchAgeDays,
    ageLabel,
    exposureLevel,
    exposureMult,
    hasExploits,
    exploitCount: exploitCVEs.length,
    exploitCVEIds: exploitCVEs.map(c => c.cveId),
    cveSeverityBreakdown,
    weights:    { cvss: W_CVSS, compliance: W_COMP },
    thresholds: { compMax: COMP_MAX },
  };

  return { score, priority, reasons, breakdown };
}

// ── GET /api/risk/latest/:hostname ────────────────────────────────────────────
router.get("/latest/:hostname", async (req, res) => {
  try {
    const hostname = req.params.hostname;
    const re = hostnameRegex(hostname);
     
      const [patch, failedCount, meta, cveMatches, agent] = await Promise.all([
      Patch.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
      ComplianceCheck.countDocuments({ assetHostname: re, result: "failed" }),
      AssetMeta.findOne({ hostname: re }),
      CVEMatch.find({ assetHostname: re }),
      Agent.findOne({ hostname: re }).lean(),
    ]);
    const vulnMatches = agent?.wazuhId ? await getVulnMatchesForAgent(agent.wazuhId) : [];

    const risk = await computeRisk({ patch, compliance: { failedCount }, meta, cveMatches, vulnMatches });

    res.json({
      ok: true,
      hostname,
      risk,
        inputs: {
        missingCount:          patch?.missingCount     ?? 0,
        failedCount:           failedCount             ?? 0,
        criticality:           meta?.criticality       ?? 0.5,
        role:                  meta?.role              ?? "workstation",
        cveCount:              cveMatches?.length      ?? 0,
        vulnCount:             vulnMatches?.length      ?? 0,
        patchCollectedAt:      patch?.collectedAt      ?? null,
        patchAgeDays:          patch?.collectedAt
          ? Math.floor((Date.now() - new Date(patch.collectedAt).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ── GET /api/risk/all ─────────────────────────────────────────────────────────
router.get("/all", async (req, res) => {
  try {
    const metas = await AssetMeta.find({});
    const results = [];

    for (const meta of metas) {
      const re = hostnameRegex(meta.hostname);

       const [patch, failedCount, cveMatches, agent] = await Promise.all([
        Patch.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
        ComplianceCheck.countDocuments({ assetHostname: re, result: "failed" }),
        CVEMatch.find({ assetHostname: re }),
        Agent.findOne({ hostname: re }).lean(),
      ]);
      const vulnMatches = agent?.wazuhId ? await getVulnMatchesForAgent(agent.wazuhId) : [];

      const risk = await computeRisk({ patch, compliance: { failedCount }, meta, cveMatches, vulnMatches });

      results.push({
        hostname:    meta.hostname,
        role:        meta.role,
        criticality: meta.criticality,
        risk,
        inputs: {
          missingCount: patch?.missingCount     ?? 0,
          failedCount:  compliance?.failedCount ?? 0,
          cveCount:     cveMatches?.length      ?? 0,
          vulnCount:    vulnMatches?.length     ?? 0,
          patchAgeDays: patch?.collectedAt
            ? Math.floor((Date.now() - new Date(patch.collectedAt).getTime()) / (1000 * 60 * 60 * 24))
            : null,
        },
      });
    }

    results.sort((a, b) => b.risk.score - a.risk.score);
    res.json({ ok: true, count: results.length, data: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});


router.get("/cve/:hostname", requireAuth, async (req, res) => {
  try {
    const { hostname } = req.params;
    const rx = new RegExp("^" + hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
    const matches = await CVEMatch.find({ assetHostname: { $regex: rx } })
      .sort({ cvssScore: -1 })
      .lean();
    res.json({ ok: true, count: matches.length, data: matches });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
module.exports.computeRisk = computeRisk;
