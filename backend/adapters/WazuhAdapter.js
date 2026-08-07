/**
 * WazuhAdapter.js
 *
 * Everything genuinely Wazuh-specific about pulling compliance data lives
 * here: the OpenSearch query syntax, the index name, and how to interpret
 * Wazuh's particular document shape. Anything outside this file — the
 * collector's main loop, upsertChecks(), autoResolveTickets() — never sees
 * any of that and only works with the plain, normalized objects this
 * adapter returns.
 *
 * A future SplunkAdapter/SentinelAdapter would live alongside this file,
 * implementing the same getComplianceResults(wazuhId, hostname) signature
 * against a different backend, with zero changes required anywhere else.
 */

const https = require("https");
const axios = require("axios");

const INDEXER_URL = process.env.INDEXER_URL || "https://192.168.0.20:9200";
const INDEXER_USER = process.env.INDEXER_USER || "admin";
const INDEXER_PASS = process.env.INDEXER_PASS || "Index3rPass+2026";
const INDEX = "wazuh-alerts-4.x-*";

const client = axios.create({
  baseURL: INDEXER_URL,
  auth: { username: INDEXER_USER, password: INDEXER_PASS },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 30000,
});

// ── Pull all SCA checks for one agent via scroll ──────────────────────────────
async function fetchChecksForAgent(agentId) {
  const PAGE_SIZE = 500;
  const body = {
    size: PAGE_SIZE,
    _source: ["agent", "data.sca", "@timestamp"],
    query: {
      bool: {
        must: [
          { match: { "agent.id": agentId } },
          { term: { "rule.groups": "sca" } },
          { term: { "data.sca.type": "check" } },
        ],
      },
    },
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
    if (hits.length < PAGE_SIZE) break;

    searchAfter = hits[hits.length - 1].sort;
  }

  return allDocs;
}

// ── De-duplicate: keep only the most recent doc per checkId ──────────────────
function deduplicate(docs) {
  const map = new Map();
  for (const doc of docs) {
    const id = doc._source?.data?.sca?.check?.id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, doc);
  }
  return Array.from(map.values());
}

// ── Normalise one OpenSearch document into the shared, adapter-agnostic shape ─
function normalise(doc, hostname, agentId) {
  const sca = doc._source.data.sca;
  const check = sca.check;

  const resultRaw = (check.result || "").toLowerCase();
  let result = resultRaw;
  if (resultRaw.includes("fail")) result = "failed";
  else if (resultRaw.includes("pass")) result = "passed";
  else if (resultRaw.includes("not")) result = "not applicable";

  return {
    assetHostname: hostname,
    agentId,
    policy: sca.policy || null,
    checkId: String(check.id || "unknown"),
    title: check.title || "",
    result,
    description: check.description || "",
    rationale: check.rationale || "",
    remediation: check.remediation || "",
    command: Array.isArray(check.command) ? check.command : [],
    collectedAt: new Date(doc._source["@timestamp"] || Date.now()),
  };
}

/**
 * getComplianceResults(agentId, hostname) — the one method the rest of the
 * system actually calls. Everything above this line is Wazuh's business;
 * everything below is the public contract.
 */
async function getComplianceResults(agentId, hostname) {
  const docs = await fetchChecksForAgent(agentId);
  if (docs.length === 0) return [];
  const unique = deduplicate(docs);
  return unique.map((d) => normalise(d, hostname, agentId));
}

// ── Pull vulnerability state docs, optionally filtered by agent ─────────────
async function fetchVulnDocs(agentId) {
  const VULN_INDEX = "wazuh-states-vulnerabilities-*";
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
    const res = await client.post(`/${VULN_INDEX}/_search`, body);
    const hits = res.data.hits.hits;
    if (!hits || hits.length === 0) break;
    allDocs.push(...hits);
    if (hits.length < body.size) break;
    searchAfter = hits[hits.length - 1].sort;
    if (allDocs.length >= 5000) break;
  }
  return allDocs;
}

function normaliseVuln(doc) {
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

/**
 * getVulnerabilities(agentId) — same public-contract idea as
 * getComplianceResults(): everything Wazuh-specific stays above this line.
 */
async function getVulnerabilities(agentId) {
  const docs = await fetchVulnDocs(agentId);
  return docs.map(normaliseVuln);
}

module.exports = { getComplianceResults, getVulnerabilities, fetchVulnDocs, normaliseVuln };

