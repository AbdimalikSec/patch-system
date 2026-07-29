const router       = require("express").Router();
const RiskSnapshot = require("../models/RiskSnapshot");
const Patch        = require("../models/Patch");
const Compliance   = require("../models/Compliance");
const AssetMeta    = require("../models/AssetMeta");
const CVEMatch     = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");
const { requireRole } = require("../middleware/authMiddleware");
const { computeRisk } = require("./risk");
const Agent = require("../models/Agent");
const { getVulnMatchesForAgent } = require("./vulnerabilities");


function hostnameRegex(h) { return { $regex: new RegExp(`^${h}$`, "i") }; }

async function computeScore(hostname) {
  const re = hostnameRegex(hostname);
  const [patch, compliance, meta, cveMatches, liveChecks, agent] = await Promise.all([
    Patch.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
    Compliance.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
    AssetMeta.findOne({ hostname: re }),
    CVEMatch.find({ assetHostname: re }),
    ComplianceCheck.countDocuments({ assetHostname: re, result: "failed" }),
    Agent.findOne({ hostname: re }).lean(),
  ]);
  const vulnMatches = agent?.wazuhId ? await getVulnMatchesForAgent(agent.wazuhId) : [];

  const failedCount  = liveChecks || compliance?.failedCount || 0;
  const missingCount = patch?.missingCount ?? 0;
  const cveCount     = cveMatches?.length ?? 0;
  const patchAgeDays = patch?.collectedAt
    ? Math.floor((Date.now() - new Date(patch.collectedAt).getTime()) / 86400000)
    : 0;

const risk = await computeRisk({
    patch,
    compliance: { failedCount },
    meta,
    cveMatches,
    vulnMatches,
  });

  return {
    score: risk.score,
    priority: risk.priority,
    missingCount,
    failedCount,
    cveCount,
    patchAgeDays,
  };
}

// ── POST /api/snapshots/record — save today's snapshot for all assets ─────────
// Call this once per day (manually or via cron)
router.post("/record", requireRole("admin"), async (req, res) => {
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
