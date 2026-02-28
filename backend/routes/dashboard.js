const router = require("express").Router();
const Asset           = require("../models/Asset");
const Patch           = require("../models/Patch");
const Compliance      = require("../models/Compliance");
const ComplianceCheck = require("../models/ComplianceCheck");

function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findLatestCaseInsensitive(Model, field, hostname) {
  const rx = new RegExp(`^${escapeRegex(hostname)}$`, "i");
  return Model.findOne({ [field]: { $regex: rx } }).sort({ collectedAt: -1 }).lean();
}

// GET /api/dashboard/patches/backlog
router.get("/patches/backlog", async (req, res) => {
  try {
    const assets = await Asset.find({}).lean();
    const out = [];

    for (const a of assets) {
      const p = await findLatestCaseInsensitive(Patch, "assetHostname", a.hostname);
      if (!p) continue;

      const missing = Array.isArray(p.missing) ? p.missing : [];

      for (const item of missing) {
        out.push({
          hostname: a.hostname,
          os: p.os,
          missingItem: item,
          collectedAt: p.collectedAt,
          missingCount: p.missingCount ?? missing.length,
        });
      }

      if ((p.missingCount || 0) > 0 && missing.length === 0) {
        out.push({
          hostname: a.hostname,
          os: p.os,
          missingItem: "(missing list not available)",
          collectedAt: p.collectedAt,
          missingCount: p.missingCount,
        });
      }
    }

    res.json({ ok: true, data: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/dashboard/compliance/failed
router.get("/compliance/failed", async (req, res) => {
  try {
    const assets = await Asset.find({}).lean();
    const out = [];

    for (const a of assets) {
      const c = await findLatestCaseInsensitive(Compliance, "assetHostname", a.hostname);
      if (!c) continue;

      const failed = Array.isArray(c.failed) ? c.failed : [];

      for (const f of failed) {
        out.push({
          hostname: a.hostname,
          failedItem: f,
          collectedAt: c.collectedAt,
          failedCount: c.failedCount ?? failed.length,
          score: c.score ?? null,
        });
      }

      if ((c.failedCount || 0) > 0 && failed.length === 0) {
        out.push({
          hostname: a.hostname,
          failedItem: "(failed list not available)",
          collectedAt: c.collectedAt,
          failedCount: c.failedCount,
          score: c.score ?? null,
        });
      }
    }

    res.json({ ok: true, data: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/dashboard/compliance/summary
// Counts directly from compliancechecks so scores update after every collector run
router.get("/compliance/summary", async (req, res) => {
  try {
    const assets = await Asset.find({}).lean();
    const out = [];

    for (const a of assets) {
      const rx = new RegExp(`^${escapeRegex(a.hostname)}$`, "i");

      const [failedCount, totalCount, latestCheck] = await Promise.all([
        ComplianceCheck.countDocuments({ assetHostname: { $regex: rx }, result: "failed" }),
        ComplianceCheck.countDocuments({ assetHostname: { $regex: rx }, result: { $in: ["failed", "passed"] } }),
        ComplianceCheck.findOne({ assetHostname: { $regex: rx } }).sort({ collectedAt: -1 }).lean(),
      ]);

      if (totalCount === 0) {
        out.push({
          hostname: a.hostname,
          status: "No Data",
          score: null,
          failedCount: null,
          collectedAt: null,
        });
        continue;
      }

      const score = Math.round(((totalCount - failedCount) / totalCount) * 100);

      out.push({
        hostname: a.hostname,
        status: failedCount > 0 ? "Non-Compliant" : "Compliant",
        score,
        failedCount,
        collectedAt: latestCheck?.collectedAt || null,
      });
    }

    res.json({ ok: true, data: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;