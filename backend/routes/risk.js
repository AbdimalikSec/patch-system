const router = require("express").Router();

const Patch = require("../models/Patch");
const Compliance = require("../models/Compliance");
const AssetMeta = require("../models/AssetMeta");

// Simple academic v1 scoring (can be improved later)
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeRisk({ patch, compliance, meta }) {
  const criticality = meta?.criticality ?? 0.4; // 0..1

  // Patch factor (0..1)
  const missingCount = patch?.missingCount ?? 0;
  const patchFactor = clamp(missingCount / 20, 0, 1); // 20+ missing = max

  // Compliance factor (0..1)
  const failedCount = compliance?.failedCount ?? 0;
  const complianceFactor = clamp(failedCount / 10, 0, 1); // 10+ failed = max

  // Weighted score (0..100)
  // Base risk comes from patch+compliance, then scaled by asset criticality.
  const base = (0.6 * patchFactor + 0.4 * complianceFactor); // 0..1
  const score = clamp(Math.round(base * (50 + criticality * 50) * 2), 0, 100);

  // Priority buckets
  let priority = "Low";
  if (score >= 80) priority = "Critical";
  else if (score >= 60) priority = "High";
  else if (score >= 35) priority = "Medium";

  // Justification text
  const reasons = [];
  reasons.push(`Missing updates: ${missingCount}`);
  reasons.push(`Compliance failures: ${failedCount}`);
  reasons.push(`Criticality: ${criticality}`);

  return { score, priority, reasons };
}

// GET /api/risk/latest/:hostname
router.get("/latest/:hostname", async (req, res) => {
  try {
    const hostname = req.params.hostname;

    const [patch, compliance, meta] = await Promise.all([
      Patch.findOne({ assetHostname: hostname }).sort({ collectedAt: -1 }),
      Compliance.findOne({ assetHostname: hostname }).sort({ collectedAt: -1 }),
      AssetMeta.findOne({ hostname }),
    ]);

    const risk = computeRisk({ patch, compliance, meta });

    res.json({
      ok: true,
      hostname,
      risk,
      inputs: {
        patchCollectedAt: patch?.collectedAt ?? null,
        complianceCollectedAt: compliance?.collectedAt ?? null,
        metaUpdatedAt: meta?.updatedAt ?? null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
