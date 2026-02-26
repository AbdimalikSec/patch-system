const router = require("express").Router();

const Patch      = require("../models/Patch");
const Compliance = require("../models/Compliance");
const AssetMeta  = require("../models/AssetMeta");

// ─────────────────────────────────────────────────────────────────────────────
// RISK ENGINE v2
//
// Formula (documented for academic submission):
//
//   RiskScore = clamp(
//     (W_patch × PatchFactor + W_comp × CompFactor) × CriticalityMultiplier × 100,
//     0, 100
//   )
//
// Where:
//   PatchFactor   = clamp(missingCount / PATCH_MAX, 0, 1)
//   CompFactor    = clamp(failedChecks / COMP_MAX,  0, 1)
//
//   CriticalityMultiplier = 0.5 + (criticality × 0.5)
//     → maps criticality 0.0–1.0 to multiplier range 0.5–1.0
//     → ensures low-criticality assets cannot reach score 100
//       and high-criticality assets amplify base risk by up to 2×
//
// Weight justification (per NIST SP 800-30 risk factor prioritisation):
//   W_patch = 0.55  — Unpatched software is the leading attack vector
//                     (Verizon DBIR 2023: 36% of breaches exploit known vulns)
//   W_comp  = 0.45  — CIS benchmark failures represent misconfiguration
//                     attack surface. Weighted slightly lower than patch
//                     because not all misconfigurations are directly exploitable.
//
// Normalisation thresholds (calibrated to lab environment):
//   PATCH_MAX = 50   — 50+ missing updates = maximum patch factor
//   COMP_MAX  = 300  — 300+ CIS failures = maximum compliance factor
//                      (DC1 has ~292, so 300 gives meaningful differentiation)
//
// Risk tiers (aligned with CVSS v3.1 qualitative severity scale):
//   Critical  >= 75
//   High      >= 50
//   Medium    >= 25
//   Low        < 25
//
// NOTE: When CVE/CVSS data is integrated (Step 3), PatchFactor will be
// replaced by a CVSS-weighted severity score, making the formula:
//   RiskScore = (W_cvss × CVSSFactor + W_comp × CompFactor) × CriticalityMultiplier × 100
// ─────────────────────────────────────────────────────────────────────────────

const W_PATCH    = 0.55;
const W_COMP     = 0.45;
const PATCH_MAX  = 50;
const COMP_MAX   = 300;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeRisk({ patch, compliance, meta }) {
  // ── Inputs ────────────────────────────────────────────────────────────────
  const missingCount  = patch?.missingCount       ?? 0;
  const failedCount   = compliance?.failedCount   ?? 0;
  const criticality   = meta?.criticality         ?? 0.5;
  const role          = meta?.role                ?? "workstation";

  // ── Factor calculation ────────────────────────────────────────────────────
  const patchFactor      = clamp(missingCount / PATCH_MAX, 0, 1);
  const complianceFactor = clamp(failedCount  / COMP_MAX,  0, 1);

  // ── Criticality multiplier (0.5 to 1.0) ──────────────────────────────────
  const criticalityMultiplier = 0.5 + (criticality * 0.5);

  // ── Weighted base risk (0 to 1) ───────────────────────────────────────────
  const baseRisk = (W_PATCH * patchFactor) + (W_COMP * complianceFactor);

  // ── Final score (0 to 100) ────────────────────────────────────────────────
  const score = clamp(Math.round(baseRisk * criticalityMultiplier * 100), 0, 100);

  // ── Risk tier ─────────────────────────────────────────────────────────────
  let priority;
  if      (score >= 75) priority = "Critical";
  else if (score >= 50) priority = "High";
  else if (score >= 25) priority = "Medium";
  else                  priority = "Low";

  // ── Explainable breakdown ─────────────────────────────────────────────────
  const reasons = [
    `Asset role: ${role} (criticality=${criticality}, multiplier=${criticalityMultiplier.toFixed(2)})`,
    `Missing patches: ${missingCount} → patch factor = ${patchFactor.toFixed(3)} (weight ${W_PATCH})`,
    `CIS failures: ${failedCount} → compliance factor = ${complianceFactor.toFixed(3)} (weight ${W_COMP})`,
    `Base risk = (${W_PATCH} × ${patchFactor.toFixed(3)}) + (${W_COMP} × ${complianceFactor.toFixed(3)}) = ${baseRisk.toFixed(3)}`,
    `Final score = ${baseRisk.toFixed(3)} × ${criticalityMultiplier.toFixed(2)} × 100 = ${score}`,
  ];

  // ── Structured breakdown for evaluation framework ─────────────────────────
  const breakdown = {
    patchFactor:           parseFloat(patchFactor.toFixed(4)),
    complianceFactor:      parseFloat(complianceFactor.toFixed(4)),
    criticalityMultiplier: parseFloat(criticalityMultiplier.toFixed(4)),
    baseRisk:              parseFloat(baseRisk.toFixed(4)),
    weights: { patch: W_PATCH, compliance: W_COMP },
    thresholds: { patchMax: PATCH_MAX, compMax: COMP_MAX },
  };

  return { score, priority, reasons, breakdown };
}

// ── GET /api/risk/latest/:hostname ────────────────────────────────────────────
router.get("/latest/:hostname", async (req, res) => {
  try {
    const hostname = req.params.hostname;

    const [patch, compliance, meta] = await Promise.all([
      Patch.findOne({
        assetHostname: { $regex: new RegExp(`^${hostname}$`, "i") }
      }).sort({ collectedAt: -1 }),

      Compliance.findOne({
        assetHostname: { $regex: new RegExp(`^${hostname}$`, "i") }
      }).sort({ collectedAt: -1 }),

      AssetMeta.findOne({
        hostname: { $regex: new RegExp(`^${hostname}$`, "i") }
      }),
    ]);

    const risk = computeRisk({ patch, compliance, meta });

    res.json({
      ok: true,
      hostname,
      risk,
      inputs: {
        missingCount:          patch?.missingCount       ?? 0,
        failedCount:           compliance?.failedCount   ?? 0,
        criticality:           meta?.criticality         ?? 0.5,
        role:                  meta?.role                ?? "workstation",
        patchCollectedAt:      patch?.collectedAt        ?? null,
        complianceCollectedAt: compliance?.collectedAt   ?? null,
        metaUpdatedAt:         meta?.updatedAt           ?? null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ── GET /api/risk/all ─────────────────────────────────────────────────────────
// Returns risk scores for all assets — used by evaluation framework
router.get("/all", async (req, res) => {
  try {
    const metas = await AssetMeta.find({});
    const results = [];

    for (const meta of metas) {
      const [patch, compliance] = await Promise.all([
        Patch.findOne({
          assetHostname: { $regex: new RegExp(`^${meta.hostname}$`, "i") }
        }).sort({ collectedAt: -1 }),
        Compliance.findOne({
          assetHostname: { $regex: new RegExp(`^${meta.hostname}$`, "i") }
        }).sort({ collectedAt: -1 }),
      ]);

      const risk = computeRisk({ patch, compliance, meta });

      results.push({
        hostname:    meta.hostname,
        role:        meta.role,
        criticality: meta.criticality,
        risk,
        inputs: {
          missingCount: patch?.missingCount     ?? 0,
          failedCount:  compliance?.failedCount ?? 0,
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