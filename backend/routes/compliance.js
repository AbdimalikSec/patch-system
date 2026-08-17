const router = require("express").Router();
const Compliance      = require("../models/Compliance");
const ComplianceCheck = require("../models/ComplianceCheck");
const { requireRole } = require("../middleware/authMiddleware");

function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/compliance/latest/:hostname
// Returns the latest compliance summary doc (used by AssetDetails header info)
router.get("/latest/:hostname", requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
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

router.get("/checks/:hostname", requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
  try {
    const rx = new RegExp(`^${escapeRegex(req.params.hostname)}$`, "i");
    const checks = await ComplianceCheck.find({ assetHostname: { $regex: rx } })
      .sort({ result: 1, checkId: 1 })
      .lean();

    // ?framework=X selects which framework's mapping to attach (defaults to
    // ISO for backward compatibility with anything still expecting the
    // original response shape). frameworkMatch is the new, generic field
    // any framework's view can read; iso27001 stays populated exactly as
    // before so nothing already working ever breaks.
    const framework = req.query.framework || "iso27001";
    const { getControlForCheckTitle } = require("../utils/frameworkMapping");
    const enriched = checks.map(c => {
      const match = getControlForCheckTitle(framework, c.title);
      return {
        ...c,
        frameworkMatch: match,
        iso27001: framework === "iso27001" ? match : c.iso27001,
      };
    });
    res.json({ ok: true, count: enriched.length, data: enriched, framework });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/compliance/checks/:hostname/failed
// Returns only failed checks
router.get("/checks/:hostname/failed", requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
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
