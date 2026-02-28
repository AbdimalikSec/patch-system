const router = require("express").Router();
const Compliance      = require("../models/Compliance");
const ComplianceCheck = require("../models/ComplianceCheck");

function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/compliance/latest/:hostname
// Returns the latest compliance summary doc (used by AssetDetails header info)
router.get("/latest/:hostname", async (req, res) => {
  try {
    const rx  = new RegExp(`^${escapeRegex(req.params.hostname)}$`, "i");
    const doc = await Compliance.findOne({ assetHostname: { $regex: rx } })
      .sort({ collectedAt: -1 })
      .lean();
    res.json({ ok: true, data: doc || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/compliance/checks/:hostname
// Returns all compliance checks for an asset, sorted failed first
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