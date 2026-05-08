const router = require("express").Router();

const Patch      = require("../models/Patch");
const Compliance = require("../models/Compliance");
const AssetMeta  = require("../models/AssetMeta");
const CVEMatch   = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");

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

async function computeRisk({ patch, compliance, meta, cveMatches }) {
  const missingCount = patch?.missingCount     ?? 0;
  const failedCount  = compliance?.failedCount ?? 0;
  const criticality  = meta?.criticality       ?? 0.5;
  const role         = meta?.role              ?? "workstation";

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
    cvssSource = `${cvssCount} CVEs (max CVSS: ${maxCVSS.toFixed(1)})`;
  }

  const cvssValue  = maxCVSS > 0 ? maxCVSS : (missingCount / PATCH_MAX) * 10;
  // Apply age factor to CVSS value before normalising
  const cvssAged   = cvssValue * ageFactor;
  const cvssFactor = clamp(cvssAged / 10.0, 0, 1);

  // ── ComplianceFactor ──────────────────────────────────────────────────────
  const complianceFactor = clamp(failedCount / COMP_MAX, 0, 1);

  // ── CriticalityMultiplier ─────────────────────────────────────────────────
  const criticalityMultiplier = 0.5 + (criticality * 0.5);

  // ── Final score ───────────────────────────────────────────────────────────
  const baseRisk = (W_CVSS * cvssFactor) + (W_COMP * complianceFactor);
  const score    = clamp(Math.round(baseRisk * criticalityMultiplier * 100), 0, 100);

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
    `CVE data: ${cvssSource}`,
    `Patch age: ${ageLabel}`,
    `CVSS factor = (${cvssValue.toFixed(1)} × ${ageFactor}) / 10 = ${cvssFactor.toFixed(3)} (weight ${W_CVSS})`,
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
    ageFactor,
    patchAgeDays,
    ageLabel,
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

    const [patch, compliance, meta, cveMatches] = await Promise.all([
      Patch.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
      Compliance.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
      AssetMeta.findOne({ hostname: re }),
      CVEMatch.find({ assetHostname: re }),
    ]);

    const risk = await computeRisk({ patch, compliance, meta, cveMatches });

    res.json({
      ok: true,
      hostname,
      risk,
      inputs: {
        missingCount:          patch?.missingCount     ?? 0,
        failedCount:           compliance?.failedCount ?? 0,
        criticality:           meta?.criticality       ?? 0.5,
        role:                  meta?.role              ?? "workstation",
        cveCount:              cveMatches?.length      ?? 0,
        patchCollectedAt:      patch?.collectedAt      ?? null,
        complianceCollectedAt: compliance?.collectedAt ?? null,
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
      const [patch, compliance, cveMatches] = await Promise.all([
        Patch.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
        Compliance.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
        CVEMatch.find({ assetHostname: re }),
      ]);

      const risk = await computeRisk({ patch, compliance, meta, cveMatches });

      results.push({
        hostname:    meta.hostname,
        role:        meta.role,
        criticality: meta.criticality,
        risk,
        inputs: {
          missingCount: patch?.missingCount     ?? 0,
          failedCount:  compliance?.failedCount ?? 0,
          cveCount:     cveMatches?.length      ?? 0,
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

module.exports = router;