const router = require("express").Router();
const Compliance = require("../models/Compliance");

// POST /api/compliance/ingest
router.post("/ingest", async (req, res) => {
  try {
    const { assetHostname, failedCount, failed, score, raw } = req.body;
    if (!assetHostname) return res.status(400).json({ ok: false, error: "assetHostname required" });

    const doc = await Compliance.create({
      assetHostname,
      failedCount: failedCount ?? (Array.isArray(failed) ? failed.length : 0),
      failed: failed || [],
      score: score ?? 100,
      raw: raw || req.body,
      collectedAt: new Date(),
    });

    res.json({ ok: true, complianceId: doc._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/compliance/latest/:hostname
router.get("/latest/:hostname", async (req, res) => {
  const doc = await Compliance.findOne({ assetHostname: req.params.hostname }).sort({ collectedAt: -1 });
  res.json({ ok: true, data: doc });
});

module.exports = router;
