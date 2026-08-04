const router      = require("express").Router();
const AssetGroup  = require("../models/AssetsGroup");
const Patch       = require("../models/Patch");
const Compliance  = require("../models/Compliance");
const AssetMeta   = require("../models/AssetMeta");
const CVEMatch    = require("../models/CVEMatch");
const ComplianceCheck = require("../models/ComplianceCheck");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { computeRisk } = require("./risk");
const Agent = require("../models/Agent");
const { getVulnMatchesForAgent } = require("./vulnerabilities");
const { deployAllMissingForHost } = require("./deploy");

function hostnameRegex(h) {
  return { $regex: new RegExp(`^${h}$`, "i") };
}

// Maps a group's category to the Agent.networkCategory value it requires.
// "custom" groups have no restriction — any machine can join.
const CATEGORY_REQUIREMENT = {
  domain: "domain",
  physical: "physical",
  security: "security",
  custom: null,
};

// Checks whether a hostname is eligible to join a group of the given
// category, and whether it's already a member of a different group.
// Returns { ok: true } or { ok: false, error: "..." }.
async function checkMembershipEligibility(hostname, targetGroup) {
  const required = CATEGORY_REQUIREMENT[targetGroup.category];

  if (required) {
    const agent = await Agent.findOne({ hostname: hostnameRegex(hostname) }).lean();
    if (!agent) {
      return { ok: false, error: `${hostname} is not a registered machine` };
    }
    if (agent.networkCategory !== required) {
      return {
        ok: false,
        error: `${hostname} is categorized as "${agent.networkCategory}", but "${targetGroup.name}" only accepts "${required}" machines`,
      };
    }
  }

  const existingGroup = await AssetGroup.findOne({
    _id: { $ne: targetGroup._id },
    members: hostname,
  }).lean();
  if (existingGroup) {
    return {
      ok: false,
      error: `${hostname} is already a member of "${existingGroup.name}" — remove it there first`,
    };
  }

  return { ok: true };
}

// Compute aggregated stats for a group
async function computeGroupStats(members) {
  let totalFailed = 0, totalChecks = 0, totalMissing = 0;
  let maxScore = 0, maxPriority = "Low";
  const priorityRank = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  for (const hostname of members) {
    const re = hostnameRegex(hostname);
     
     const [patch, checks, meta, cves, agent] = await Promise.all([
      Patch.findOne({ assetHostname: re }).sort({ collectedAt: -1 }),
      ComplianceCheck.aggregate([
        { $match: { assetHostname: { $regex: new RegExp(`^${hostname}$`, "i") } } },
        { $group: { _id: "$result", count: { $sum: 1 } } },
      ]),
      AssetMeta.findOne({ hostname: re }),
      CVEMatch.find({ assetHostname: re }),
      Agent.findOne({ hostname: re }).lean(),
    ]);
    const vulnMatches = agent?.wazuhId ? await getVulnMatchesForAgent(agent.wazuhId) : [];

    totalMissing += patch?.missingCount || 0;

    let failed = 0, total = 0;
    for (const c of checks) {
      total += c.count;
      if (c._id === "failed") failed = c.count;
    }
    totalFailed += failed;
    totalChecks += total;

// Use the SAME risk engine as everywhere else, instead of a local copy
    const risk = await computeRisk({
      patch,
      compliance: { failedCount: failed },
      meta,
      cveMatches: cves,
      vulnMatches,
    });
    if (risk.score > maxScore) {
      maxScore = risk.score;
      maxPriority = risk.priority;
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
router.get("/", requireAuth, requireRole("admin", "compliance-officer", "analyst"), async (req, res) => {
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
// POST /api/groups — create a new group
router.post("/", requireAuth, requireRole("admin", "compliance-officer"), async (req, res) => {
  try {
    const { name, description, color, icon, members, owner, category } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "name required" });

    const cat = category || "custom";
    if (!["domain", "physical", "security", "custom"].includes(cat)) {
      return res.status(400).json({ ok: false, error: "Invalid category" });
    }

    const group = await AssetGroup.create({
      name, description, color, icon, members: [], owner, category: cat,
    });

    // If initial members were provided, add them one at a time through the
    // same eligibility check used everywhere else, rather than bypassing it.
    const requestedMembers = members || [];
    const rejected = [];
    for (const hostname of requestedMembers) {
      const check = await checkMembershipEligibility(hostname, group);
      if (check.ok) {
        await AssetGroup.updateOne({ _id: group._id }, { $addToSet: { members: hostname } });
      } else {
        rejected.push({ hostname, reason: check.error });
      }
    }

    const finalGroup = await AssetGroup.findById(group._id).lean();
    res.json({ ok: true, data: finalGroup, rejectedMembers: rejected });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ ok: false, error: "Group name already exists" });
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// PATCH /api/groups/:id — update group
router.patch("/:id", requireAuth, requireRole("admin", "compliance-officer"), async (req, res) => {
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
router.delete("/:id", requireAuth, requireRole("admin", "compliance-officer"), async (req, res) => {
  try {
    await AssetGroup.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/groups/:id/members — add member to group
// POST /api/groups/:id/members — add member to group
router.post("/:id/members", requireAuth, requireRole("admin", "compliance-officer"), async (req, res) => {
  try {
    const { hostname } = req.body;
    if (!hostname) return res.status(400).json({ ok: false, error: "hostname required" });

    const group = await AssetGroup.findById(req.params.id).lean();
    if (!group) return res.status(404).json({ ok: false, error: "Group not found" });

    const check = await checkMembershipEligibility(hostname, group);
    if (!check.ok) {
      return res.status(400).json({ ok: false, error: check.error });
    }

    const updated = await AssetGroup.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: hostname } },
      { new: true }
    );
    res.json({ ok: true, data: updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// DELETE /api/groups/:id/members/:hostname — remove member
router.delete("/:id/members/:hostname", requireAuth, requireRole("admin", "compliance-officer"), async (req, res) => {
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

// POST /api/groups/:id/patch-all — deploy every missing patch across every
// member of this group, one machine after another. Admin-only: this is a
// higher-blast-radius action than the per-machine "Patch All Missing"
// button (which patch-operator already has via Backlog), so it gets the
// same gating as other high-impact actions like machine registration.
router.post("/:id/patch-all", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const group = await AssetGroup.findById(req.params.id).lean();
    if (!group) return res.status(404).json({ ok: false, error: "Group not found" });

    if (!group.members || group.members.length === 0) {
      return res.json({
        ok: true,
        groupName: group.name,
        memberCount: 0,
        perHost: [],
        message: "Group has no members",
      });
    }

    // Sequential across hosts too — keeps load predictable and matches the
    // same "one at a time" philosophy as the per-host deploy loop.
    const perHost = [];
    for (const hostname of group.members) {
      const r = await deployAllMissingForHost(hostname, req.user?.username, req.user?._id);
      perHost.push(r);
    }

    const totalDeployed = perHost.reduce((s, h) => s + h.count, 0);
    const totalSucceeded = perHost.reduce((s, h) => s + h.succeeded, 0);

    res.json({
      ok: true,
      groupName: group.name,
      memberCount: group.members.length,
      totalDeployed,
      totalSucceeded,
      perHost,
      message: `Deployed ${totalSucceeded}/${totalDeployed} missing patches across ${group.members.length} machine(s) in "${group.name}"`,
    });
  } catch (e) {
    console.error("[groups/patch-all]", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
