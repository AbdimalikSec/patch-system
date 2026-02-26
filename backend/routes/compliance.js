const router = require("express").Router();
const Compliance = require("../models/Compliance");
const ComplianceCheck = require("../models/ComplianceCheck");

/**
 * Normalize raw check objects coming from collectors_wazuh_sca.js
 */
function normalizeChecks(rawChecks = []) {
  const out = [];

  for (const c of rawChecks) {
    const resultRaw = (c.result || "").toString().toLowerCase();

    let result = resultRaw;
    if (resultRaw.includes("fail")) result = "failed";
    else if (resultRaw.includes("pass")) result = "passed";
    else if (resultRaw.includes("invalid")) result = "invalid";
    else if (resultRaw.includes("not")) result = "not applicable";

    out.push({
      checkId: c.id?.toString() || "unknown",
      title: c.title || "",
      description: c.description || "",
      rationale: c.rationale || "",
      remediation: c.remediation || "",
      command: Array.isArray(c.command) ? c.command : [],
      result,
      policy: c.policy_id || null
    });
  }

  return out;
}

// POST /api/compliance/ingest
router.post("/ingest", async (req, res) => {
  try {
    const { assetHostname, failedCount, failed, score, raw, source, collectedAt } = req.body;

    if (!assetHostname) {
      return res.status(400).json({ ok: false, error: "assetHostname required" });
    }

    // 1️⃣ Store summary (your original logic preserved)
    const complianceDoc = await Compliance.create({
      assetHostname,
      source: source || "wazuh",
      collectedAt: collectedAt ? new Date(collectedAt) : new Date(),
      failedCount:
        failedCount === null || failedCount === undefined
          ? Array.isArray(failed)
            ? failed.length
            : 0
          : failedCount,
      failed: Array.isArray(failed) ? failed : [],
      score:
        score === null || score === undefined
          ? 100
          : score,
      raw: raw || req.body,
    });

    // 2️⃣ Extract and store individual CIS checks (if available)
    if (raw && Array.isArray(raw.failedChecks)) {
      const normalized = normalizeChecks(raw.failedChecks);

      for (const check of normalized) {
        await ComplianceCheck.findOneAndUpdate(
          {
            assetHostname: assetHostname,
            checkId: check.checkId
          },
          {
            assetHostname,
            policy: check.policy,
            checkId: check.checkId,
            title: check.title,
            description: check.description,
            rationale: check.rationale,
            remediation: check.remediation,
            command: check.command,
            result: check.result,
            collectedAt: collectedAt ? new Date(collectedAt) : new Date()
          },
          { upsert: true }
        );
      }
    }

    res.json({ ok: true, complianceId: complianceDoc._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/compliance/latest/:hostname
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

// NEW: GET /api/compliance/checks/:hostname
router.get("/checks/:hostname", async (req, res) => {
  try {
    const host = req.params.hostname;

    const docs = await ComplianceCheck.find({
      assetHostname: { $regex: new RegExp(`^${host}$`, "i") }
    }).sort({ checkId: 1 });

    res.json({ ok: true, count: docs.length, data: docs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;