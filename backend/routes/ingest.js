const router = require("express").Router();
const Asset = require("../models/Asset");
const Patch = require("../models/Patch");
const Agent = require("../models/Agent");

// POST /api/ingest/asset
router.post("/asset", async (req, res) => {
  try {
      const { hostname, os, ip, source, raw } = req.body;
    if (!hostname || !os) {
      return res
        .status(400)
        .json({ ok: false, error: "hostname and os are required" });
    }
    // Reject data for any machine that isn't an active, registered Agent --
    // this is what stops an orphaned collector script on a deleted machine
    // from silently resurrecting Asset/Patch records after deletion.
    const agentExists = await Agent.findOne({ hostname, archived: { $ne: true } });
    if (!agentExists) {
      return res.status(403).json({ ok: false, error: "Machine is not registered or has been removed" });
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
      { upsert: true, new: true },
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
      return res
        .status(400)
        .json({ ok: false, error: "assetHostname and os required" });
    }
    const agentExists = await Agent.findOne({ hostname: assetHostname, archived: { $ne: true } });
    if (!agentExists) {
      return res.status(403).json({ ok: false, error: "Machine is not registered or has been removed" });
    }
    const incomingMissing = missing || [];
    const doc = await Patch.findOneAndUpdate(
      { assetHostname },
      {
        $set: {
          assetHostname,
          os,
          missingCount: incomingMissing.length,
          missing: incomingMissing,
          raw: raw || req.body,
          collectedAt: new Date(),
          pendingRestart: [],
        },
      },
      { upsert: true, new: true },
    );
    res.json({ ok: true, patchId: doc._id });
  } catch (e) {
    console.error("Patch ingest error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
