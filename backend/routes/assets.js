const router = require("express").Router();
const Asset           = require("../models/Asset");
const Patch           = require("../models/Patch");
const Compliance      = require("../models/Compliance");
const AssetMeta       = require("../models/AssetMeta");
const CVEMatch        = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");

// ─────────────────────────────────────────────────────────────────────────────
// RISK ENGINE — mirrors risk.js exactly so Overview and /api/risk/all agree
//
//   RiskScore = clamp(
//     (W_cvss × CVSSFactor + W_comp × CompFactor) × CriticalityMultiplier × 100,
//     0, 100
//   )
// ─────────────────────────────────────────────────────────────────────────────
const W_CVSS    = 0.55;
const W_COMP    = 0.45;
const PATCH_MAX = 50;
const COMP_MAX  = 300;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeRisk({ patch, meta, failedCount, cveMatches }) {
  const missingCount          = patch?.missingCount  ?? 0;
  const criticality           = meta?.criticality    ?? 0.5;
  const role                  = meta?.role           ?? "workstation";
  const criticalityMultiplier = 0.5 + (criticality * 0.5);

  // CVSSFactor
  let maxCVSS   = 0;
  let cvssCount = 0;
  if (cveMatches && cveMatches.length > 0) {
    cvssCount = cveMatches.length;
    maxCVSS   = Math.max(...cveMatches.map(c => c.cvssScore || 0));
  }
  const cvssValue  = maxCVSS > 0 ? maxCVSS : (missingCount / PATCH_MAX) * 10;
  const cvssFactor = clamp(cvssValue / 10.0, 0, 1);

  // ComplianceFactor
  const complianceFactor = clamp(failedCount / COMP_MAX, 0, 1);

  // Final score
  const baseRisk = (W_CVSS * cvssFactor) + (W_COMP * complianceFactor);
  const score    = clamp(Math.round(baseRisk * criticalityMultiplier * 100), 0, 100);

  let priority;
  if      (score >= 75) priority = "Critical";
  else if (score >= 50) priority = "High";
  else if (score >= 25) priority = "Medium";
  else                  priority = "Low";

  const reasons = [
    `Asset role: ${role} (criticality=${criticality}, multiplier=${criticalityMultiplier.toFixed(2)})`,
    `CVE data: ${cvssCount > 0 ? `${cvssCount} CVEs (max CVSS: ${maxCVSS.toFixed(1)})` : "patch count fallback"}`,
    `CVSS factor = ${cvssValue.toFixed(1)} / 10 = ${cvssFactor.toFixed(3)} (weight ${W_CVSS})`,
    `CIS failures: ${failedCount} → compliance factor = ${complianceFactor.toFixed(3)} (weight ${W_COMP})`,
    `Final score = ${baseRisk.toFixed(3)} × ${criticalityMultiplier.toFixed(2)} × 100 = ${score}`,
  ];

  return { score, priority, reasons };
}

// GET /api/assets/overview
router.get("/overview", async (req, res) => {
  try {
    const assets = await Asset.find({}).sort({ lastSeen: -1 });

    const rows = await Promise.all(
      assets.map(async (a) => {
        const rx = new RegExp(`^${a.hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

        const [patch, compliance, meta, cveMatches, failedCount, totalCount, latestCheck] = await Promise.all([
          Patch.findOne({ assetHostname: { $regex: rx } }).sort({ collectedAt: -1 }),
          Compliance.findOne({ assetHostname: { $regex: rx } }).sort({ collectedAt: -1 }),
          AssetMeta.findOne({ hostname: { $regex: rx } }),
          CVEMatch.find({ assetHostname: { $regex: rx } }),
          ComplianceCheck.countDocuments({ assetHostname: { $regex: rx }, result: "failed" }),
          ComplianceCheck.countDocuments({ assetHostname: { $regex: rx }, result: { $in: ["failed", "passed"] } }),
          ComplianceCheck.findOne({ assetHostname: { $regex: rx } }).sort({ collectedAt: -1 }),
        ]);

        const score        = totalCount > 0 ? Math.round(((totalCount - failedCount) / totalCount) * 100) : null;
        const collectedAt  = latestCheck?.collectedAt || compliance?.collectedAt || null;
        const risk         = computeRisk({ patch, meta, failedCount, cveMatches });

        return {
          hostname:  a.hostname,
          os:        a.os,
          ip:        a.ip,
          source:    a.source,
          lastSeen:  a.lastSeen,
          patch: patch ? {
            collectedAt:  patch.collectedAt,
            missingCount: patch.missingCount,
          } : null,
          compliance: {
            collectedAt,
            failedCount,
            score,
          },
          meta: meta ? {
            role:        meta.role,
            criticality: meta.criticality,
          } : null,
          risk,
        };
      })
    );

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;