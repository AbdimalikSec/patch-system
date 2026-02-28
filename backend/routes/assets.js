const router = require("express").Router();
const Asset           = require("../models/Asset");
const Patch           = require("../models/Patch");
const AssetMeta       = require("../models/AssetMeta");
const CVEMatch        = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");

const W_CVSS = 0.55, W_COMP = 0.45, PATCH_MAX = 50, COMP_MAX = 300;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function computeRisk({ patch, meta, failedCount, cveMatches }) {
  const missingCount = patch?.missingCount ?? 0;
  const criticality  = meta?.criticality ?? 0.5;
  const role         = meta?.role ?? "workstation";
  const critMult     = 0.5 + (criticality * 0.5);
  let maxCVSS = 0, cvssCount = 0;
  if (cveMatches?.length > 0) {
    cvssCount = cveMatches.length;
    maxCVSS   = Math.max(...cveMatches.map(c => c.cvssScore || 0));
  }
  const cvssValue      = maxCVSS > 0 ? maxCVSS : (missingCount / PATCH_MAX) * 10;
  const cvssFactor     = clamp(cvssValue / 10.0, 0, 1);
  const compFactor     = clamp(failedCount / COMP_MAX, 0, 1);
  const baseRisk       = (W_CVSS * cvssFactor) + (W_COMP * compFactor);
  const score          = clamp(Math.round(baseRisk * critMult * 100), 0, 100);
  const priority       = score >= 75 ? "Critical" : score >= 50 ? "High" : score >= 25 ? "Medium" : "Low";
  const reasons = [
    `Asset role: ${role} (criticality=${criticality}, multiplier=${critMult.toFixed(2)})`,
    `CVE data: ${cvssCount > 0 ? `${cvssCount} CVEs (max CVSS: ${maxCVSS.toFixed(1)})` : "patch count fallback"}`,
    `CVSS factor = ${cvssValue.toFixed(1)} / 10 = ${cvssFactor.toFixed(3)} (weight ${W_CVSS})`,
    `CIS failures: ${failedCount} -> compliance factor = ${compFactor.toFixed(3)} (weight ${W_COMP})`,
    `Final score = ${baseRisk.toFixed(3)} x ${critMult.toFixed(2)} x 100 = ${score}`,
  ];
  return { score, priority, reasons };
}

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
      const risk        = computeRisk({ patch, meta, failedCount, cveMatches });
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