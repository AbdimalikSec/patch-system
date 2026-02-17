const router = require("express").Router();
const Asset = require("../models/Asset");
const Patch = require("../models/Patch");
const Compliance = require("../models/Compliance");

// assumes you already added Risk model/routes; we will just call the risk endpoint-like logic if stored,
// OR we compute minimal ranking by failedCount/missingCount if risk doc not stored.
// If you DO store risk docs in Mongo, tell me and I will link it directly.

async function getLatestByHostname(Model, hostnameField, collectedField = "collectedAt") {
  return Model.findOne({ [hostnameField]: hostnameField === "assetHostname" ? undefined : undefined });
}

router.get("/patches/backlog", async (req, res) => {
  try {
    const assets = await Asset.find({}).lean();

    const out = [];
    for (const a of assets) {
      const p = await Patch.findOne({ assetHostname: a.hostname }).sort({ collectedAt: -1 }).lean();
      if (!p) continue;

      const missing = Array.isArray(p.missing) ? p.missing : [];
      for (const item of missing) {
        out.push({
          hostname: a.hostname,
          os: p.os,
          missingItem: item,
          collectedAt: p.collectedAt,
          missingCount: p.missingCount || missing.length,
        });
      }

      // if missingCount>0 but list is empty (windows academic collector), still show a row
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
      const c = await Compliance.findOne({ assetHostname: a.hostname }).sort({ collectedAt: -1 }).lean();
      if (!c) continue;

      const failed = Array.isArray(c.failed) ? c.failed : [];
      for (const f of failed) {
        out.push({
          hostname: a.hostname,
          failedItem: f,
          collectedAt: c.collectedAt,
          failedCount: c.failedCount || failed.length,
          score: c.score,
        });
      }

      if ((c.failedCount || 0) > 0 && failed.length === 0) {
        out.push({
          hostname: a.hostname,
          failedItem: "(failed list not available)",
          collectedAt: c.collectedAt,
          failedCount: c.failedCount,
          score: c.score,
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
      const c = await Compliance.findOne({ assetHostname: a.hostname })
        .sort({ collectedAt: -1 })
        .lean();

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

      const failedCount = c.failedCount ?? (Array.isArray(c.failed) ? c.failed.length : 0);

      out.push({
        hostname: a.hostname,
        status: failedCount > 0 ? "Non-Compliant" : "Compliant",
        score: c.score ?? null,
        failedCount,
        collectedAt: c.collectedAt,
      });
    }

    res.json({ ok: true, data: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});


module.exports = router;
