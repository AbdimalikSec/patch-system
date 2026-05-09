const router       = require("express").Router();
const RiskSnapshot = require("../models/RiskSnapshot");
const Patch        = require("../models/Patch");
const Compliance   = require("../models/Compliance");
const AssetMeta    = require("../models/AssetMeta");
const CVEMatch     = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");

const W_CVSS    = 0.55;
const W_COMP    = 0.45;
const PATCH_MAX = 50;
const COMP_MAX  = 300;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function hostnameRegex(h)   { return { $regex: new RegExp(`^${h}$`, "i") }; }

function getAgeFactor(collectedAt) {
  if (!collectedAt) return 1.0;
  const days = Math.floor((Date.now() - new Date(collectedAt).getTime()) / 86400000);
  if (days < 7)  return 1.0;
  if (days < 30) return 1.1;
  if (days < 60) return 1.2;
  if (days < 90) return 1.35;
  return 1.5;
}

async function computeScore(hostname) {
  const re = hostnameRegex(hostname);
  const [patch, compliance, meta, cveMatches, liveChecks] = await Promise.all([
    Patch.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
    Compliance.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
    AssetMeta.findOne({ hostname: re }),
    CVEMatch.find({ assetHostname: re }),
    ComplianceCheck.countDocuments({ assetHostname: re, result: "failed" }),
  ]);

  const missingCount = patch?.missingCount ?? 0;
  const failedCount  = liveChecks || compliance?.failedCount || 0;
  const criticality  = meta?.criticality ?? 0.5;
  const cveCount     = cveMatches?.length ?? 0;
  const patchAgeDays = patch?.collectedAt
    ? Math.floor((Date.now() - new Date(patch.collectedAt).getTime()) / 86400000)
    : 0;

  const ageFactor  = getAgeFactor(patch?.collectedAt);
  const maxCVSS    = cveMatches?.length ? Math.max(...cveMatches.map(c => c.cvssScore || 0)) : 0;
  const cvssValue  = maxCVSS > 0 ? maxCVSS : (missingCount / PATCH_MAX) * 10;
  const cvssFactor = clamp((cvssValue * ageFactor) / 10.0, 0, 1);
  const compFactor = clamp(failedCount / COMP_MAX, 0, 1);
  const critMult   = 0.5 + (criticality * 0.5);
  const score      = clamp(Math.round((W_CVSS * cvssFactor + W_COMP * compFactor) * critMult * 100), 0, 100);

  let priority;
  if      (score >= 75) priority = "Critical";
  else if (score >= 50) priority = "High";
  else if (score >= 25) priority = "Medium";
  else                  priority = "Low";

  return { score, priority, missingCount, failedCount, cveCount, patchAgeDays };
}

// ── POST /api/snapshots/record — save today's snapshot for all assets ─────────
// Call this once per day (manually or via cron)
router.post("/record", async (req, res) => {
  try {
    const metas = await AssetMeta.find({});
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const saved = [];

    for (const meta of metas) {
      const data = await computeScore(meta.hostname);
      await RiskSnapshot.findOneAndUpdate(
        { assetHostname: meta.hostname, snapshotDate: today },
        { ...data, assetHostname: meta.hostname, snapshotDate: today, recordedAt: new Date() },
        { upsert: true, new: true }
      );
      saved.push({ hostname: meta.hostname, ...data });
    }

    res.json({ ok: true, date: today, count: saved.length, data: saved });
  } catch (e) {
    console.error("Snapshot record error:", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ── GET /api/snapshots/history?days=30 — get trend data for all assets ────────
router.get("/history", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const snapshots = await RiskSnapshot.find(
      { snapshotDate: { $gte: sinceStr } },
      { assetHostname: 1, snapshotDate: 1, score: 1, priority: 1, missingCount: 1, failedCount: 1, _id: 0 }
    ).sort({ snapshotDate: 1 }).lean();

    // Group by hostname
    const grouped = {};
    for (const s of snapshots) {
      if (!grouped[s.assetHostname]) grouped[s.assetHostname] = [];
      grouped[s.assetHostname].push({
        date:         s.snapshotDate,
        score:        s.score,
        priority:     s.priority,
        missingCount: s.missingCount,
        failedCount:  s.failedCount,
      });
    }

    res.json({ ok: true, days, data: grouped });
  } catch (e) {
    console.error("Snapshot history error:", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ── GET /api/snapshots/latest — most recent snapshot per asset ────────────────
router.get("/latest", async (req, res) => {
  try {
    const latest = await RiskSnapshot.aggregate([
      { $sort: { snapshotDate: -1 } },
      { $group: { _id: "$assetHostname", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
    ]);
    res.json({ ok: true, data: latest });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;