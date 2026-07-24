require("dotenv").config();

const router = require("express").Router();
const { requireAuth } = require("../middleware/authMiddleware");
const Agent = require("../models/Agent");
const axios = require("axios");
const https = require("https");

const INDEXER_URL  = process.env.INDEXER_URL  || "https://192.168.0.20:9200";
const INDEXER_USER = process.env.INDEXER_USER || "admin";
const INDEXER_PASS = process.env.INDEXER_PASS || "Index3rPass+2026";
const INDEX = "wazuh-alerts-4.x-*";

const client = axios.create({
  baseURL: INDEXER_URL,
  auth: { username: INDEXER_USER, password: INDEXER_PASS },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 30000,
});

// ── Pull "Active" vulnerability-detector docs, optionally filtered by agent ──
async function fetchVulnDocs(agentId) {
  const must = [
    { term: { "rule.groups": "vulnerability-detector" } },
    { term: { "data.vulnerability.status": "Active" } },
  ];
  if (agentId) must.push({ term: { "agent.id": agentId } });

  const body = {
    size: 500,
    _source: ["agent", "data.vulnerability", "@timestamp"],
    query: { bool: { must } },
    sort: [{ "@timestamp": "desc" }],
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

// ── De-duplicate: keep the newest doc per (agent + CVE) pair ────────────────
function dedupe(docs) {
  const map = new Map();
  for (const doc of docs) {
    const v = doc._source?.data?.vulnerability;
    const agentId = doc._source?.agent?.id;
    if (!v?.cve || !agentId) continue;
    const key = `${agentId}:${v.cve}`;
    if (!map.has(key)) map.set(key, doc); // sorted desc already — first = newest
  }
  return Array.from(map.values());
}

function normalise(doc) {
  const v = doc._source.data.vulnerability;
  return {
    cve: v.cve,
    package: v.package?.name || "",
    version: v.package?.version || "",
    condition: v.package?.condition || "",
    severity: v.severity || "",
    cvssScore: v.score?.base || v.cvss?.cvss3?.base_score || null,
    published: v.published || null,
    updated: v.updated || null,
    references: [v.reference, v.scanner?.reference].filter(Boolean),
  };
}

// ── GET /api/vulnerabilities/summary — CVE counts per enrolled machine ──────
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const docs = dedupe(await fetchVulnDocs());
    const agents = await Agent.find({}).lean();
    const agentById = new Map(agents.map((a) => [a.wazuhId, a]));

    const byHost = new Map();
    for (const doc of docs) {
      const agentId = doc._source.agent.id;
      const agentName = doc._source.agent.name;
      const a = agentById.get(agentId);
      const hostname = a ? a.hostname : agentName;
      const os = a ? a.os : "";

      if (!byHost.has(hostname)) {
        byHost.set(hostname, {
          hostname,
          os,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          total: 0,
        });
      }
      const g = byHost.get(hostname);
      const sev = (doc._source.data.vulnerability.severity || "").toLowerCase();
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
router.get("/:hostname", requireAuth, async (req, res) => {
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

    const docs = dedupe(await fetchVulnDocs(agent.wazuhId));
    const items = docs
      .map(normalise)
      .sort((a, b) => (b.cvssScore || 0) - (a.cvssScore || 0));

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

module.exports = router;
