const router = require("express").Router();
const Compliance      = require("../models/Compliance");
const ComplianceCheck = require("../models/ComplianceCheck");

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/compliance/ingest   — unchanged from your original
// ─────────────────────────────────────────────────────────────────────────────
router.post("/ingest", async (req, res) => {
  try {
    const { assetHostname, failedCount, failed, score, raw, source, collectedAt } = req.body;
    if (!assetHostname) return res.status(400).json({ ok: false, error: "assetHostname required" });

    const doc = await Compliance.create({
      assetHostname,
      source: source || "wazuh",
      collectedAt: collectedAt ? new Date(collectedAt) : new Date(),

      failedCount: (failedCount === null || failedCount === undefined)
        ? (Array.isArray(failed) ? failed.length : 0)
        : failedCount,

      failed: Array.isArray(failed) ? failed : [],

      score: (score === null || score === undefined) ? 100 : score,

      raw: raw || req.body,
    });

    res.json({ ok: true, complianceId: doc._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/compliance/latest/:hostname   — unchanged from your original
// ─────────────────────────────────────────────────────────────────────────────
router.get("/latest/:hostname", async (req, res) => {
  try {
    const host = req.params.hostname;

    const doc = await Compliance.findOne({
      assetHostname: { $regex: new RegExp(`^${host}$`, "i") }
    }).sort({ collectedAt: -1 });

    res.json({ ok: true, data: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/compliance/checks/:hostname   — NEW
//
// Returns all individual CIS checks stored by collectors_wazuh_indexer_sca.js
// Optional query param:  ?result=failed   (or passed / not+applicable)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/checks/:hostname", async (req, res) => {
  try {
    const host   = req.params.hostname;
    const result = req.query.result; // optional filter

    const filter = {
      assetHostname: { $regex: new RegExp(`^${host}$`, "i") },
    };

    if (result) {
      filter.result = result.toLowerCase();
    }

    const docs = await ComplianceCheck.find(filter)
      .sort({ result: 1, checkId: 1 }) // failed first (f < p), then by id
      .lean();

    res.json({ ok: true, count: docs.length, data: docs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;