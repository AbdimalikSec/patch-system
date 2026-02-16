const router = require("express").Router();
const Asset = require("../models/Asset");

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

module.exports = router;
