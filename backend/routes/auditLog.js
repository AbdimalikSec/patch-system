require("dotenv").config();

const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
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

// ── Pull login/auth events, optionally filtered by agent ────────────────────
// Covers Windows Security event log (4624/4625 via Wazuh's win_security rules)
// and Linux sshd/su/sudo auth logs — both land in these same rule.groups.
async function fetchAuthDocs(agentId, maxPages = 4) {
  const must = [
    {
      bool: {
        should: [
          { term: { "rule.groups": "authentication_success" } },
          { term: { "rule.groups": "authentication_failed" } },
          { term: { "rule.groups": "authentication_failures" } },
        ],
        minimum_should_match: 1,
      },
    },
  ];
  if (agentId) must.push({ term: { "agent.id": agentId } });

  const body = {
    size: 500,
    _source: ["agent", "data", "rule", "@timestamp"],
    query: { bool: { must } },
    sort: [{ "@timestamp": "desc" }],
  };

  const allDocs = [];
  let searchAfter = null;
  let pages = 0;

  while (pages < maxPages) {
    if (searchAfter) body.search_after = searchAfter;
    const res = await client.post(`/${INDEX}/_search`, body);
    const hits = res.data.hits.hits;
    if (!hits || hits.length === 0) break;
    allDocs.push(...hits);
    if (hits.length < body.size) break;
    searchAfter = hits[hits.length - 1].sort;
    pages++;
  }
  return allDocs;
}

// ── Normalise a Wazuh alert doc into a plain login event ────────────────────
function normalise(doc) {
  const d = doc._source.data || {};
  const rule = doc._source.rule || {};
  const win = d.win || {};
  const groups = rule.groups || [];

  let result = "unknown";
  if (groups.includes("authentication_failed") || groups.includes("authentication_failures")) {
    result = "failed";
  } else if (groups.includes("authentication_success")) {
    result = "success";
  } else if (win.system?.eventID === "4624") {
    result = "success";
  } else if (win.system?.eventID === "4625") {
    result = "failed";
  }

  const user = win.eventdata?.targetUserName || d.srcuser || d.dstuser || "unknown";
  const srcIp = win.eventdata?.ipAddress || d.srcip || "-";

  return {
    hostname: doc._source.agent?.name || "unknown",
    user,
    srcIp,
    result,
    description: rule.description || "",
    timestamp: doc._source["@timestamp"],
  };
}

// ── GET /api/audit-log/summary — success/failure counts per machine ─────────
router.get("/summary", requireAuth, requireRole("admin", "auditor"), async (req, res) => {
  try {
    const docs = await fetchAuthDocs(null, 4); // up to ~2000 recent events
    const byHost = new Map();

    for (const doc of docs) {
      const hostname = doc._source.agent?.name || "unknown";
      if (!byHost.has(hostname)) {
        byHost.set(hostname, { hostname, success: 0, failed: 0, total: 0 });
      }
      const n = normalise(doc);
      const g = byHost.get(hostname);
      if (n.result === "success") g.success++;
      else if (n.result === "failed") g.failed++;
      g.total++;
    }

    res.json({ ok: true, data: Array.from(byHost.values()) });
  } catch (e) {
    console.error("[audit-log/summary]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/audit-log/:hostname — individual login events for one machine ──
router.get("/:hostname", requireAuth, requireRole("admin", "auditor"), async (req, res) => {
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

    const docs = await fetchAuthDocs(agent.wazuhId, 4);
    const items = docs
      .map(normalise)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ ok: true, hostname: agent.hostname, count: items.length, data: items });
  } catch (e) {
    console.error("[audit-log/:hostname]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
