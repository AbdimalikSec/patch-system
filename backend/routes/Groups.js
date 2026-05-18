const router      = require("express").Router();
const AssetGroup  = require("../models/AssetGroup");
const Patch       = require("../models/Patch");
const Compliance  = require("../models/Compliance");
const AssetMeta   = require("../models/AssetMeta");
const CVEMatch    = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");

function hostnameRegex(h) {
  return { $regex: new RegExp(`^${h}$`, "i") };
}

// Compute aggregated stats for a group
async function computeGroupStats(members) {
  let totalFailed = 0, totalChecks = 0, totalMissing = 0;
  let maxScore = 0, maxPriority = "Low";
  const priorityRank = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  for (const hostname of members) {
    const re = hostnameRegex(hostname);

    const [patch, checks, meta, cves] = await Promise.all([
      Patch.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
      ComplianceCheck.aggregate([
        { $match: { assetHostname: { $regex: new RegExp(`^${hostname}$`, "i") } } },
        { $group: { _id: "$result", count: { $sum: 1 } } },
      ]),
      AssetMeta.findOne({ hostname: re }),
      CVEMatch.find({ assetHostname: re }),
    ]);

    totalMissing += patch?.missingCount || 0;

    let failed = 0, total = 0;
    for (const c of checks) {
      total += c.count;
      if (c._id === "failed") failed = c.count;
    }
    totalFailed += failed;
    totalChecks += total;

    // Simple risk score estimate for group
    const criticality = meta?.criticality || 0.5;
    const maxCVSS     = cves.length ? Math.max(...cves.map(c => c.cvssScore || 0)) : 0;
    const cvssVal     = maxCVSS > 0 ? maxCVSS : (patch?.missingCount || 0) / 50 * 10;
    const compFactor  = total > 0 ? failed / 300 : 0;
    const score       = Math.min(100, Math.round(
      (0.55 * Math.min(cvssVal / 10, 1) + 0.45 * Math.min(compFactor, 1)) *
      (0.5 + criticality * 0.5) * 100
    ));

    if (score > maxScore) {
      maxScore = score;
      maxPriority = score >= 75 ? "Critical" : score >= 50 ? "High" : score >= 25 ? "Medium" : "Low";
    }
  }

  const complianceScore = totalChecks > 0
    ? Math.round(((totalChecks - totalFailed) / totalChecks) * 100)
    : null;

  return {
    memberCount:      members.length,
    totalMissing,
    totalFailed,
    totalChecks,
    complianceScore,
    highestRiskScore: maxScore,
    highestPriority:  maxPriority,
  };
}

// GET /api/groups — list all groups with aggregated stats
router.get("/", async (req, res) => {
  try {
    const groups = await AssetGroup.find({}).lean();
    const results = [];
    for (const g of groups) {
      const stats = await computeGroupStats(g.members);
      results.push({ ...g, stats });
    }
    results.sort((a, b) => b.stats.highestRiskScore - a.stats.highestRiskScore);
    res.json({ ok: true, count: results.length, data: results });
  } catch (e) {
    console.error("Groups error:", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/groups — create a new group
router.post("/", async (req, res) => {
  try {
    const { name, description, color, icon, members, owner } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "name required" });
    const group = await AssetGroup.create({ name, description, color, icon, members: members || [], owner });
    res.json({ ok: true, data: group });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ ok: false, error: "Group name already exists" });
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// PATCH /api/groups/:id — update group
router.patch("/:id", async (req, res) => {
  try {
    const { name, description, color, icon, members, owner } = req.body;
    const group = await AssetGroup.findByIdAndUpdate(
      req.params.id,
      { name, description, color, icon, members, owner },
      { new: true }
    );
    if (!group) return res.status(404).json({ ok: false, error: "Group not found" });
    res.json({ ok: true, data: group });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// DELETE /api/groups/:id
router.delete("/:id", async (req, res) => {
  try {
    await AssetGroup.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/groups/:id/members — add member to group
router.post("/:id/members", async (req, res) => {
  try {
    const { hostname } = req.body;
    const group = await AssetGroup.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: hostname } },
      { new: true }
    );
    res.json({ ok: true, data: group });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// DELETE /api/groups/:id/members/:hostname — remove member
router.delete("/:id/members/:hostname", async (req, res) => {
  try {
    const group = await AssetGroup.findByIdAndUpdate(
      req.params.id,
      { $pull: { members: req.params.hostname } },
      { new: true }
    );
    res.json({ ok: true, data: group });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;