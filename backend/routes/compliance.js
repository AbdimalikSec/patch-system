const router = require("express").Router();
const ComplianceCheck = require("../models/ComplianceCheck");

function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/compliance/checks/:hostname
// Returns all compliance checks for an asset, sorted by result (failed first)
router.get("/checks/:hostname", async (req, res) => {
  try {
    const rx = new RegExp(`^${escapeRegex(req.params.hostname)}$`, "i");

    const checks = await ComplianceCheck.find({ assetHostname: { $regex: rx } })
      .sort({ result: 1, checkId: 1 })
      .lean();

    res.json({ ok: true, count: checks.length, data: checks });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/compliance/checks/:hostname/failed
// Returns only failed checks
router.get("/checks/:hostname/failed", async (req, res) => {
  try {
    const rx = new RegExp(`^${escapeRegex(req.params.hostname)}$`, "i");

    const checks = await ComplianceCheck.find({
      assetHostname: { $regex: rx },
      result: "failed",
    }).sort({ checkId: 1 }).lean();

    res.json({ ok: true, count: checks.length, data: checks });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;