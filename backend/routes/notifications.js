const router = require("express").Router();
const ComplianceCheck = require("../models/ComplianceCheck");

// GET /api/notifications/new-failures?since=<ISO timestamp>
// Returns compliance checks that newly failed since the given timestamp
router.get("/new-failures", async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : null;

    if (!since || isNaN(since.getTime())) {
      return res.status(400).json({ ok: false, error: "since timestamp required" });
    }

    // Find checks that are currently failed AND were updated after login time
    const newFailures = await ComplianceCheck.find({
      result: "failed",
      updatedAt: { $gt: since },
    })
      .select("assetHostname checkId title result updatedAt policy")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    res.json({ ok: true, count: newFailures.length, data: newFailures });
  } catch (e) {
    console.error("Notifications error:", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;