require("dotenv").config();

const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const Agent = require("../models/Agent");
const axios = require("axios");
const https = require("https");

const INDEXER_URL  = process.env.INDEXER_URL  || "https://192.168.0.20:9200";
const INDEXER_USER = process.env.INDEXER_USER || "admin";
const INDEXER_PASS = process.env.INDEXER_PASS || "Index3rPass+2026";

// New Wazuh vulnerability module (v4.8+) stores current-state documents here —
// each doc IS the latest state for one (agent, package, CVE) combination.
// No @timestamp field exists on these docs, and no separate status field either;
// unlike the old wazuh-alerts-4.x-* index this replaces.
const INDEX = "wazuh-states-vulnerabilities-*";

const client = axios.create({
  baseURL: INDEXER_URL,
  auth: { username: INDEXER_USER, password: INDEXER_PASS },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 30000,
});

// ── Pull vulnerability state docs, optionally filtered by agent ─────────────
async function fetchVulnDocs(agentId) {
  const must = [];
  if (agentId) must.push({ term: { "agent.id": agentId } });

  const body = {
    size: 500,
    _source: ["agent", "package", "vulnerability"],
    query: must.length ? { bool: { must } } : { match_all: {} },
    sort: [{ "vulnerability.score.base": "desc" }],
  };

  const allDocs = [];
  let searchAfter = null;

  while (true) {
    if (searchAfter) body.search_after = searchAfter;
    const res = await client.post(`/${INDEX}/_search`, body);
    const hits = res.data.hits.hits;
    if (!hits || hits.length === 0) break;
    allDocs.push(...hits);
    if (hits.length < body.size) break;
    searchAfter = hits[hits.length - 1].sort;
    if (allDocs.length >= 5000) break; // safety cap
  }
  return allDocs;
}

function normalise(doc) {
  const v = doc._source.vulnerability || {};
  const pkg = doc._source.package || {};
  return {
    cve: v.id,
    package: pkg.name || "",
    version: pkg.version || "",
    condition: v.scanner?.condition || "",
    severity: v.severity || "",
    cvssScore: v.score?.base ?? null,
    published: v.published_at || null,
    updated: v.detected_at || null,
    references: [v.reference, v.scanner?.reference].filter(Boolean),
  };
}

// ── GET /api/vulnerabilities/summary — CVE counts per enrolled machine ──────
router.get("/summary", requireAuth, requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
  try {
    const agents = await Agent.find({ wazuhId: { $ne: "" } }).lean();

    // Start every enrolled machine at zero so a clean/unscanned machine still
    // shows up on the page instead of silently vanishing from the list.
    const byHost = new Map();
    for (const a of agents) {
      byHost.set(a.wazuhId, {
        hostname: a.hostname,
        os: a.os,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
      });
    }

    const docs = await fetchVulnDocs();
    for (const doc of docs) {
      const agentId = doc._source.agent.id;
      const g = byHost.get(agentId);
      if (!g) continue; // finding for an agent not in our DB — skip (e.g. BR-staff)
      const sev = (doc._source.vulnerability.severity || "").toLowerCase();
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

    if (!agent || !agent.wazuhId) {
      return res.status(404).json({
        ok: false,
        error: "No Wazuh agent ID on file for this machine",
      });
    }

    const docs = await fetchVulnDocs(agent.wazuhId);
    const items = docs.map(normalise);

    res.json({
      ok: true,
      hostname: agent.hostname,
      count: items.length,
      data: items,
    });
  } catch (e) {
    console.error("[vulnerabilities/:hostname]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Reusable helper — get normalised vulnerability matches for one agent,
// so the risk engine (risk.js) can factor in real installed-software CVEs.
async function getVulnMatchesForAgent(wazuhId) {
  if (!wazuhId) return [];
  try {
    const docs = await fetchVulnDocs(wazuhId);
    return docs.map(normalise);
  } catch (e) {
    console.error("[getVulnMatchesForAgent]", e.message);
    return [];
  }
}

module.exports = router;
module.exports.getVulnMatchesForAgent = getVulnMatchesForAgent;
