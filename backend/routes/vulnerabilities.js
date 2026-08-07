require("dotenv").config();

const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const Agent = require("../models/Agent");
const SupplementalVulnMatch = require("../models/SupplementalVulnMatch");
const wazuhAdapter = require("../adapters/WazuhAdapter");

// ── GET /api/vulnerabilities/summary — CVE counts per enrolled machine ──────
router.get("/summary", requireAuth, requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
  try {
    const agents = await Agent.find({ wazuhId: { $ne: "" } }).lean();

    const byHost = new Map(); // keyed by wazuhId
    const byHostname = new Map(); // same objects, keyed by hostname for the supplemental merge below
    for (const a of agents) {
      const entry = { hostname: a.hostname, os: a.os, critical: 0, high: 0, medium: 0, low: 0, total: 0 };
      byHost.set(a.wazuhId, entry);
      byHostname.set(a.hostname.toLowerCase(), entry);
    }

    const docs = await wazuhAdapter.fetchVulnDocs();
    for (const doc of docs) {
      const agentId = doc._source.agent.id;
      const g = byHost.get(agentId);
      if (!g) continue;
      const sev = (doc._source.vulnerability.severity || "").toLowerCase();
      if (g[sev] !== undefined) g[sev]++;
      g.total++;
    }

    // Merge in supplemental matches — real installed-software CVEs found by
    // our own Debian Security Tracker lookup, for agents (like kali) where
    // Wazuh's own vulnerability engine has no coverage at all.
    const supplemental = await SupplementalVulnMatch.find({}).lean();
    for (const match of supplemental) {
      const g = byHostname.get((match.hostname || "").toLowerCase());
      if (!g) continue;
      const sev = (match.severity || "").toLowerCase();
      if (g[sev] !== undefined) g[sev]++;
      g.total++;
    }

    res.json({ ok: true, data: Array.from(byHost.values()) });
  } catch (e) {
    console.error("[vulnerabilities/summary]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/vulnerabilities/:hostname — full CVE list for one machine ──────
router.get("/:hostname", requireAuth, requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
  try {
    const agent = await Agent.findOne({
      hostname: { $regex: new RegExp(`^${req.params.hostname}$`, "i") },
    }).lean();

    if (!agent) {
      return res.status(404).json({ ok: false, error: "Machine not found" });
    }

    const wazuhItems = agent.wazuhId ? await wazuhAdapter.getVulnerabilities(agent.wazuhId) : [];

    const supplemental = await SupplementalVulnMatch.find({ hostname: agent.hostname }).lean();
    const supplementalItems = supplemental.map((s) => ({
      cve: s.cveId,
      package: s.packageName,
      version: s.version,
      condition: "",
      severity: s.severity,
      cvssScore: s.cvssScore,
      published: null,
      updated: s.detectedAt,
      references: [],
      source: s.source,
    }));

    const items = [...wazuhItems, ...supplementalItems];

    res.json({ ok: true, hostname: agent.hostname, count: items.length, data: items });
  } catch (e) {
    console.error("[vulnerabilities/:hostname]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Reusable helper — get normalised vulnerability matches for one agent, so
// the risk engine (risk.js) can factor in real installed-software CVEs.
// Merges in the supplemental (Debian-tracker fallback) matches too, for
// agents Wazuh's own engine can't cover.
async function getVulnMatchesForAgent(wazuhId) {
  if (!wazuhId) return [];
  try {
    const wazuhItems = await wazuhAdapter.getVulnerabilities(wazuhId);

    const agent = await Agent.findOne({ wazuhId }).lean();
    let supplementalItems = [];
    if (agent?.hostname) {
      const supplemental = await SupplementalVulnMatch.find({ hostname: agent.hostname }).lean();
      supplementalItems = supplemental.map((s) => ({
        cve: s.cveId,
        package: s.packageName,
        version: s.version,
        condition: "",
        severity: s.severity,
        cvssScore: s.cvssScore,
        published: null,
        updated: s.detectedAt,
        references: [],
        source: s.source,
      }));
    }

    return [...wazuhItems, ...supplementalItems];
  } catch (e) {
    console.error("[getVulnMatchesForAgent]", e.message);
    return [];
  }
}

module.exports = router;
module.exports.getVulnMatchesForAgent = getVulnMatchesForAgent;
