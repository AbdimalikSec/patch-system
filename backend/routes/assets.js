const router = require("express").Router();

const Asset = require("../models/Asset");
const Patch = require("../models/Patch");
const Compliance = require("../models/Compliance");
const AssetMeta = require("../models/AssetMeta");

// same logic as risk.js (keep consistent)
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeRisk({ patch, compliance, meta }) {
  const criticality = meta?.criticality ?? 0.4; // 0..1
  const missingCount = patch?.missingCount ?? 0;
  const failedCount = compliance?.failedCount ?? 0;

  const patchFactor = clamp(missingCount / 20, 0, 1);
  const complianceFactor = clamp(failedCount / 10, 0, 1);

  const base = (0.6 * patchFactor + 0.4 * complianceFactor);
  const score = clamp(Math.round(base * (50 + criticality * 50) * 2), 0, 100);

  let priority = "Low";
  if (score >= 80) priority = "Critical";
  else if (score >= 60) priority = "High";
  else if (score >= 35) priority = "Medium";

  const reasons = [
    `Missing updates: ${missingCount}`,
    `Compliance failures: ${failedCount}`,
    `Criticality: ${criticality}`,
  ];

  return { score, priority, reasons };
}

// GET /api/assets/overview
router.get("/overview", async (req, res) => {
  try {
    const assets = await Asset.find({}).sort({ lastSeen: -1 });

    const rows = await Promise.all(
      assets.map(async (a) => {
        const [patch, compliance, meta] = await Promise.all([
          Patch.findOne({
            assetHostname: { $regex: new RegExp(`^${a.hostname}$`, "i") }
          }).sort({ collectedAt: -1 }),

          Compliance.findOne({
            assetHostname: { $regex: new RegExp(`^${a.hostname}$`, "i") }
          }).sort({ collectedAt: -1 }),

          AssetMeta.findOne({ hostname: a.hostname }),
        ]);

        const risk = computeRisk({ patch, compliance, meta });

        return {
          hostname: a.hostname,
          os: a.os,
          ip: a.ip,
          source: a.source,
          lastSeen: a.lastSeen,

          patch: patch
            ? {
                collectedAt: patch.collectedAt,
                missingCount: patch.missingCount,
              }
            : null,

          compliance: compliance
            ? {
                collectedAt: compliance.collectedAt,
                failedCount: compliance.failedCount,
                score: compliance.score,
              }
            : null,

          meta: meta
            ? {
                role: meta.role,
                criticality: meta.criticality,
              }
            : null,

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
