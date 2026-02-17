const router = require("express").Router();
const AssetMeta = require("../models/AssetMeta");

// POST /api/meta/upsert
router.post("/upsert", async (req, res) => {
  try {
    const { hostname, role, owner, criticality, notes } = req.body;
    if (!hostname) return res.status(400).json({ ok: false, error: "hostname required" });

    const doc = await AssetMeta.findOneAndUpdate(
      { hostname },
      { hostname, role, owner, criticality, notes },
      { upsert: true, new: true }
    );

    res.json({ ok: true, metaId: doc._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/meta/:hostname
router.get("/:hostname", async (req, res) => {
  const doc = await AssetMeta.findOne({ hostname: req.params.hostname });
  res.json({ ok: true, data: doc });
});

module.exports = router;
