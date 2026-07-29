const router = require("express").Router();
const ComplianceHistory = require("../models/ComplianceHistory");
const { requireAuth } = require("../middleware/authMiddleware");

// GET /api/compliance-history/:hostname — full transition timeline for one machine
router.get("/:hostname", requireAuth, async (req, res) => {
  try {
    const rx = new RegExp(`^${req.params.hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const history = await ComplianceHistory.find({ assetHostname: { $regex: rx } })
      .sort({ changedAt: -1 })
      .limit(200)
      .lean();
    res.json({ ok: true, count: history.length, data: history });
  } catch (e) {
    console.error("[compliance-history]", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
