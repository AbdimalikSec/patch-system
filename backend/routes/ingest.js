const router = require("express").Router();
const Asset  = require("../models/Asset");
const Patch  = require("../models/Patch");

// POST /api/ingest/asset
router.post("/asset", async (req, res) => {
  try {
    const { hostname, os, ip, source, raw } = req.body;
    if (!hostname || !os) {
      return res.status(400).json({ ok: false, error: "hostname and os are required" });
    }
    const doc = await Asset.findOneAndUpdate(
      { hostname },
      {
        hostname,
        os,
        ip,
        source: source || "collector",
        raw: raw || req.body,
        lastSeen: new Date(),
      },
      { upsert: true, new: true }
    );
    return res.json({ ok: true, assetId: doc._id });
  } catch (err) {
    console.error("Ingest error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/ingest/patch  ← public, no token needed
router.post("/patch", async (req, res) => {
  try {
    const { assetHostname, os, missingCount, missing, raw } = req.body;
    if (!assetHostname || !os) {
      return res.status(400).json({ ok: false, error: "assetHostname and os required" });
    }
    const doc = await Patch.findOneAndUpdate(
      { assetHostname },
      {
        assetHostname,
        os,
        missingCount: missingCount ?? (Array.isArray(missing) ? missing.length : 0),
        missing: missing || [],
        raw: raw || req.body,
        collectedAt: new Date(),
      },
      { upsert: true, new: true }
    );
    res.json({ ok: true, patchId: doc._id });
  } catch (e) {
    console.error("Patch ingest error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;