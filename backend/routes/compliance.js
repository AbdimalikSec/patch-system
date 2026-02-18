const router = require("express").Router();
const Compliance = require("../models/Compliance");

// POST /api/compliance/ingest
router.post("/ingest", async (req, res) => {
  try {
    const { assetHostname, failedCount, failed, score, raw, source, collectedAt } = req.body;
    if (!assetHostname) return res.status(400).json({ ok: false, error: "assetHostname required" });

    const doc = await Compliance.create({
      assetHostname,
      source: source || "wazuh",
      collectedAt: collectedAt ? new Date(collectedAt) : new Date(),

      // If failedCount is null, keep it null (meaning "no data")
      failedCount: (failedCount === null || failedCount === undefined)
        ? (Array.isArray(failed) ? failed.length : 0)
        : failedCount,

      failed: Array.isArray(failed) ? failed : [],

      // If score is null, keep it null (meaning "no data")
      score: (score === null || score === undefined) ? 100 : score,

      raw: raw || req.body,
    });

    res.json({ ok: true, complianceId: doc._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/compliance/latest/:hostname  (case-insensitive exact match)
router.get("/latest/:hostname", async (req, res) => {
  try {
    const host = req.params.hostname;

    const doc = await Compliance.findOne({
      assetHostname: { $regex: new RegExp(`^${host}$`, "i") }
    }).sort({ collectedAt: -1 });

    res.json({ ok: true, data: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
