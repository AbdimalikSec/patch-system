/**
 * routes/risk.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RISK SCORING ENGINE  —  Academic Documentation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FORMULA
 * ───────
 * RiskScore = clamp(
 *   round(
 *     (W_patch  × PatchFactor  +
 *      W_comp   × CompFactor   +
 *      W_crit   × CritFactor)
 *     × 100
 *   ), 0, 100
 * )
 *
 * FACTORS (each normalised 0.0 – 1.0)
 * ────────────────────────────────────
 * PatchFactor   = min(missingCount / PATCH_CEILING, 1.0)
 *   PATCH_CEILING = 50  (≥50 missing patches → maximum patch risk)
 *   Rationale: industry benchmark; NIST SP 800-40 recommends patching
 *   within 30 days. 50+ unpatched items represents severe neglect.
 *
 * CompFactor    = min(failedChecks / COMP_CEILING, 1.0)
 *   COMP_CEILING  = 100 (≥100 CIS failures → maximum compliance risk)
 *   Rationale: CIS Benchmark Level 1 typically has 100–300 controls.
 *   100 failures represents a fundamentally misconfigured system.
 *
 * CritFactor    = asset criticality (0.0 – 1.0, stored in AssetMeta)
 *   Values: DC=1.0, Security Server=0.9, Workstation=0.4–0.5, Lab=0.2
 *   Rationale: ISO/IEC 27001 asset classification; business impact analysis.
 *
 * WEIGHTS
 * ───────
 * W_patch  = 0.40  (40%)  — Unpatched vulnerabilities are the #1 attack vector
 *                            (Verizon DBIR 2023: 36% of breaches via unpatched)
 * W_comp   = 0.35  (35%)  — CIS compliance correlates with hardening posture
 *                            (CIS Controls v8: misconfiguration = top risk)
 * W_crit   = 0.25  (25%)  — Baseline risk from asset's role and business value
 *                            (ISO 27001 A.8: asset classification required)
 * Total    = 1.00  ✓
 *
 * PRIORITY TIERS
 * ──────────────
 * Critical  ≥ 75  — Immediate action required (SLA: 24 hours)
 * High      ≥ 55  — Urgent action required   (SLA: 72 hours)
 * Medium    ≥ 30  — Scheduled remediation     (SLA: 7 days)
 * Low        < 30  — Routine maintenance       (SLA: next cycle)
 *
 * SPECIAL CASE: isolated_lab assets
 *   Assets with exposureTier = "isolated_lab" have their score capped at 40
 *   and priority capped at Medium. High patch/compliance counts on lab
 *   machines are expected and do not represent production risk.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const router = require("express").Router();

const Patch      = require("../models/Patch");
const Compliance = require("../models/Compliance");
const AssetMeta  = require("../models/AssetMeta");

// ── Constants ─────────────────────────────────────────────────────────────────
const PATCH_CEILING = 50;   // missing patches that = max patch risk
const COMP_CEILING  = 100;  // CIS failures that = max compliance risk

const W_PATCH = 0.40;       // patch weight
const W_COMP  = 0.35;       // compliance weight
const W_CRIT  = 0.25;       // criticality weight

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ── Core scoring function (exported for use in other routes) ──────────────────
function computeRisk({ patch, compliance, meta }) {

  // ── Input extraction ───────────────────────────────────────────────────────
  const missingCount   = patch?.missingCount       ?? 0;
  const failedCount    = compliance?.failedCount   ?? 0;
  const criticality    = meta?.criticality         ?? 0.4;
  const exposureTier   = meta?.exposureTier        ?? "internal_standard";
  const role           = meta?.role                ?? "workstation";

  // ── Factor calculation ─────────────────────────────────────────────────────
  const patchFactor      = clamp(missingCount / PATCH_CEILING, 0, 1);
  const compFactor       = clamp(failedCount  / COMP_CEILING,  0, 1);
  const critFactor       = clamp(criticality,                  0, 1);

  // ── Weighted score ─────────────────────────────────────────────────────────
  const rawScore = (W_PATCH * patchFactor) +
                   (W_COMP  * compFactor)  +
                   (W_CRIT  * critFactor);

  let score = clamp(Math.round(rawScore * 100), 0, 100);

  // ── Lab machine cap ────────────────────────────────────────────────────────
  const isLab = exposureTier === "isolated_lab";
  if (isLab) score = clamp(score, 0, 40);

  // ── Priority tier ──────────────────────────────────────────────────────────
  let priority;
  if      (score >= 75) priority = "Critical";
  else if (score >= 55) priority = "High";
  else if (score >= 30) priority = "Medium";
  else                  priority = "Low";

  // Lab machines capped at Medium
  if (isLab && priority === "Critical") priority = "Medium";
  if (isLab && priority === "High")     priority = "Medium";

  // ── SLA recommendation ─────────────────────────────────────────────────────
  const sla = {
    Critical : "Remediate within 24 hours",
    High     : "Remediate within 72 hours",
    Medium   : "Remediate within 7 days",
    Low      : "Address in next maintenance cycle",
  }[priority];

  // ── Explainability breakdown ───────────────────────────────────────────────
  const reasons = [
    `Asset role: ${role} | Criticality: ${criticality} | Exposure: ${exposureTier}`,
    `Patch factor: ${missingCount} missing patches / ${PATCH_CEILING} ceiling = ${(patchFactor * 100).toFixed(0)}% (weight ${(W_PATCH * 100).toFixed(0)}%) → contributes ${(W_PATCH * patchFactor * 100).toFixed(1)} pts`,
    `Compliance factor: ${failedCount} CIS failures / ${COMP_CEILING} ceiling = ${(compFactor * 100).toFixed(0)}% (weight ${(W_COMP * 100).toFixed(0)}%) → contributes ${(W_COMP * compFactor * 100).toFixed(1)} pts`,
    `Criticality factor: ${(critFactor * 100).toFixed(0)}% (weight ${(W_CRIT * 100).toFixed(0)}%) → contributes ${(W_CRIT * critFactor * 100).toFixed(1)} pts`,
    `Raw weighted score: ${(rawScore * 100).toFixed(1)} / 100${isLab ? " → capped at 40 (lab asset)" : ""}`,
    `Final score: ${score} | Priority: ${priority} | SLA: ${sla}`,
  ];

  return {
    score,
    priority,
    sla,
    breakdown: {
      patchFactor:      parseFloat((patchFactor * 100).toFixed(1)),
      compFactor:       parseFloat((compFactor  * 100).toFixed(1)),
      critFactor:       parseFloat((critFactor  * 100).toFixed(1)),
      patchContrib:     parseFloat((W_PATCH * patchFactor * 100).toFixed(1)),
      compContrib:      parseFloat((W_COMP  * compFactor  * 100).toFixed(1)),
      critContrib:      parseFloat((W_CRIT  * critFactor  * 100).toFixed(1)),
      isLabAsset:       isLab,
    },
    weights: {
      patch:      W_PATCH,
      compliance: W_COMP,
      criticality: W_CRIT,
    },
    reasons,
  };
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
        missingPatches:        patch?.missingCount      ?? 0,
        complianceFailures:    compliance?.failedCount  ?? 0,
        criticality:           meta?.criticality        ?? 0.4,
        exposureTier:          meta?.exposureTier       ?? "internal_standard",
        role:                  meta?.role               ?? "workstation",
        patchCollectedAt:      patch?.collectedAt       ?? null,
        complianceCollectedAt: compliance?.collectedAt  ?? null,
        metaUpdatedAt:         meta?.updatedAt          ?? null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ── GET /api/risk/all ─────────────────────────────────────────────────────────
// Returns risk scores for all known assets (used by dashboard + evaluation)
router.get("/all", async (req, res) => {
  try {
    const metas = await AssetMeta.find({});

    const results = await Promise.all(
      metas.map(async (meta) => {
        const [patch, compliance] = await Promise.all([
          Patch.findOne({
            assetHostname: { $regex: new RegExp(`^${meta.hostname}$`, "i") }
          }).sort({ collectedAt: -1 }),

          Compliance.findOne({
            assetHostname: { $regex: new RegExp(`^${meta.hostname}$`, "i") }
          }).sort({ collectedAt: -1 }),
        ]);

        const risk = computeRisk({ patch, compliance, meta });

        return {
          hostname:   meta.hostname,
          role:       meta.role,
          criticality: meta.criticality,
          risk,
          inputs: {
            missingPatches:     patch?.missingCount     ?? 0,
            complianceFailures: compliance?.failedCount ?? 0,
          },
        };
      })
    );

    // Sort by risk score descending
    results.sort((a, b) => b.risk.score - a.risk.score);

    res.json({ ok: true, count: results.length, data: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = { router, computeRisk };