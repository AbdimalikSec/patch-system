const router   = require("express").Router();
const AssetMeta = require("../models/AssetMeta");

// Exposure multiplier mapping — used by risk engine
const EXPOSURE_MULTIPLIER = {
  internet: 1.0,
  dmz:      0.8,
  internal: 0.5,
  isolated: 0.2,
};

// POST /api/meta/upsert — create or update asset metadata
router.post("/upsert", async (req, res) => {
  try {
    const { hostname, role, owner, criticality, notes, exposureLevel, networkZone, internet_facing } = req.body;
    if (!hostname) return res.status(400).json({ ok: false, error: "hostname required" });

    const update = { hostname };
    if (role          !== undefined) update.role           = role;
    if (owner         !== undefined) update.owner          = owner;
    if (criticality   !== undefined) update.criticality    = criticality;
    if (notes         !== undefined) update.notes          = notes;
    if (exposureLevel !== undefined) update.exposureLevel  = exposureLevel;
    if (networkZone   !== undefined) update.networkZone    = networkZone;
    if (internet_facing !== undefined) update.internet_facing = internet_facing;

    const doc = await AssetMeta.findOneAndUpdate(
      { hostname },
      update,
      { upsert: true, new: true }
    );

    res.json({ ok: true, metaId: doc._id, data: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/meta/all — return all asset metadata (used by network map)
router.get("/all", async (req, res) => {
  try {
    const docs = await AssetMeta.find({}).lean();
    // Attach exposure multiplier to each doc
    const enriched = docs.map(d => ({
      ...d,
      exposureMultiplier: EXPOSURE_MULTIPLIER[d.exposureLevel] || 0.5,
    }));
    res.json({ ok: true, count: enriched.length, data: enriched });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// PATCH /api/meta/:hostname/exposure — update exposure level only (admin quick action)
router.patch("/:hostname/exposure", async (req, res) => {
  try {
    const { exposureLevel, networkZone } = req.body;
    const allowed = ["internet", "dmz", "internal", "isolated"];
    if (!allowed.includes(exposureLevel)) {
      return res.status(400).json({ ok: false, error: "Invalid exposureLevel" });
    }
    const update = { exposureLevel };
    if (networkZone) update.networkZone = networkZone;
    if (exposureLevel === "internet") update.internet_facing = true;
    else update.internet_facing = false;

    const doc = await AssetMeta.findOneAndUpdate(
      { hostname: req.params.hostname },
      update,
      { new: true, upsert: true }
    );
    res.json({ ok: true, data: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/meta/:hostname
router.get("/:hostname", async (req, res) => {
  try {
    const doc = await AssetMeta.findOne({ hostname: req.params.hostname }).lean();
    if (!doc) return res.json({ ok: true, data: null });
    res.json({
      ok: true,
      data: {
        ...doc,
        exposureMultiplier: EXPOSURE_MULTIPLIER[doc.exposureLevel] || 0.5,
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;