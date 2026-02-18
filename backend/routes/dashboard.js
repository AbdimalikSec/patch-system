const router = require("express").Router();
const Asset = require("../models/Asset");
const Patch = require("../models/Patch");
const Compliance = require("../models/Compliance");

/**
 * Escape regex special chars in a string so we can safely build ^...$ patterns.
 */
function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find latest document for hostname with case-insensitive exact match.
 */
async function findLatestCaseInsensitive(Model, field, hostname) {
  const rx = new RegExp(`^${escapeRegex(hostname)}$`, "i");
  return Model.findOne({ [field]: { $regex: rx } }).sort({ collectedAt: -1 }).lean();
}

router.get("/patches/backlog", async (req, res) => {
  try {
    const assets = await Asset.find({}).lean();

    const out = [];
    for (const a of assets) {
      const p = await findLatestCaseInsensitive(Patch, "assetHostname", a.hostname);
      if (!p) continue;

      const missing = Array.isArray(p.missing) ? p.missing : [];

      // Show each missing item as a row
      for (const item of missing) {
        out.push({
          hostname: a.hostname,
          os: p.os,
          missingItem: item,
          collectedAt: p.collectedAt,
          missingCount: p.missingCount ?? missing.length,
        });
      }

      // If missingCount > 0 but list empty (Windows academic collector), still show one row
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

      // If failedCount > 0 but list empty, show one row
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

router.get("/compliance/summary", async (req, res) => {
  try {
    const assets = await Asset.find({}).lean();

    const out = [];
    for (const a of assets) {
      const c = await findLatestCaseInsensitive(Compliance, "assetHostname", a.hostname);

      if (!c) {
        out.push({
          hostname: a.hostname,
          status: "No Data",
          score: null,
          failedCount: null,
          collectedAt: null,
        });
        continue;
      }

      // If collector stored failedCount as null sometimes, compute safely
      const failedCount = (c.failedCount === null || c.failedCount === undefined)
        ? (Array.isArray(c.failed) ? c.failed.length : 0)
        : c.failedCount;

      out.push({
        hostname: a.hostname,
        status: failedCount > 0 ? "Non-Compliant" : "Compliant",
        score: (c.score === null || c.score === undefined) ? null : c.score,
        failedCount,
        collectedAt: c.collectedAt || null,
      });
    }

    res.json({ ok: true, data: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
