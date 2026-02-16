const router = require("express").Router();
const Patch = require("../models/Patch");

// POST /api/patches/ingest
router.post("/ingest", async (req, res) => {
  try {
    const { assetHostname, os, missingCount, missing, raw } = req.body;
    if (!assetHostname || !os) return res.status(400).json({ ok: false, error: "assetHostname and os required" });

    const doc = await Patch.create({
      assetHostname,
      os,
      missingCount: missingCount ?? (Array.isArray(missing) ? missing.length : 0),
      missing: missing || [],
      raw: raw || req.body,
      collectedAt: new Date(),
    });

    res.json({ ok: true, patchId: doc._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/patches/latest/:hostname
router.get("/latest/:hostname", async (req, res) => {
  const doc = await Patch.findOne({ assetHostname: req.params.hostname }).sort({ collectedAt: -1 });
  res.json({ ok: true, data: doc });
});

module.exports = router;
