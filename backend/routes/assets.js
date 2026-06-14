const router = require("express").Router();
const Asset           = require("../models/Asset");
const Patch           = require("../models/Patch");
const AssetMeta       = require("../models/AssetMeta");
const CVEMatch        = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");
const { computeRisk } = require("./risk");

router.get("/overview", async (req, res) => {
  try {
    const assets = await Asset.find({}).sort({ lastSeen: -1 });
    const rows = await Promise.all(assets.map(async (a) => {
      const rx = new RegExp("^" + a.hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
      const [patch, meta, cveMatches, failedCount, totalCount, latestCheck] = await Promise.all([
        Patch.findOne({ assetHostname: { $regex: rx } }).sort({ collectedAt: -1 }),
        AssetMeta.findOne({ hostname: { $regex: rx } }),
        CVEMatch.find({ assetHostname: { $regex: rx } }),
        ComplianceCheck.countDocuments({ assetHostname: { $regex: rx }, result: "failed" }),
        ComplianceCheck.countDocuments({ assetHostname: { $regex: rx }, result: { $in: ["failed", "passed"] } }),
        ComplianceCheck.findOne({ assetHostname: { $regex: rx } }).sort({ collectedAt: -1 }),
      ]);
      const score       = totalCount > 0 ? Math.round(((totalCount - failedCount) / totalCount) * 100) : null;
      const collectedAt = latestCheck?.collectedAt || null;
      const risk        = await computeRisk({ patch, compliance: { failedCount }, meta, cveMatches });
      return {
        hostname: a.hostname, os: a.os, ip: a.ip, source: a.source, lastSeen: a.lastSeen,
        patch: patch ? { collectedAt: patch.collectedAt, missingCount: patch.missingCount } : null,
        compliance: { collectedAt, failedCount, score },
        meta: meta ? { role: meta.role, criticality: meta.criticality } : null,
        risk,
      };
    }));
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;