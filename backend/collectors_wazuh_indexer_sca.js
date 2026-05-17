/**
 * collectors_wazuh_indexer_sca.js
 *
 * Pulls per-check CIS SCA results from Wazuh Indexer (OpenSearch :9200)
 * and stores each check individually in the ComplianceCheck collection.
 *
 * Run manually:  NODE_TLS_REJECT_UNAUTHORIZED=0 node collectors_wazuh_indexer_sca.js
 * Or add a cron / systemd timer the same way your other collectors run.
 *
 * Does NOT touch collectors_wazuh_sca.js or collectors_wazuh.js.
 */

require("dotenv").config();

const https   = require("https");
const axios   = require("axios");
const mongoose = require("mongoose");

// ── Config ────────────────────────────────────────────────────────────────────
const INDEXER_URL = process.env.INDEXER_URL  || "https://10.10.20.20:9200";
const INDEXER_USER = process.env.INDEXER_USER || "admin";
const INDEXER_PASS = process.env.INDEXER_PASS || "Index3rPass+2026";
const MONGO_URI   = process.env.MONGO_URI     || "mongodb://127.0.0.1:27017/riskpatch";
const INDEX       = "wazuh-alerts-4.x-*";

// Agent id → hostname mapping — keeps queries fast and avoids duplicate names.
// Add every agent you have here. id is the Wazuh agent id (string, zero-padded).
const AGENTS = [
  { id: "000", hostname: "Wazuh"      },
  { id: "001", hostname: "DC1"        },
  { id: "002", hostname: "BR-staff"   },
  { id: "004", hostname: "HQ-staff-01"},
  { id: "005", hostname: "kali"       },
];

// ── Axios instance (skip TLS verification — lab environment) ──────────────────
const client = axios.create({
  baseURL: INDEXER_URL,
  auth: { username: INDEXER_USER, password: INDEXER_PASS },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 30000,
});

// ── Mongoose model (loaded after DB connect) ──────────────────────────────────
let ComplianceCheck;

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
          { term:  { "rule.groups": "sca" } },
          { term:  { "data.sca.type": "check" } },
        ],
      },
    },
    // Return only the most recent result for each checkId by sorting desc.
    // We will de-duplicate in JS after collecting all pages.
    sort: [{ "@timestamp": "desc" }],
  };

  // Use search_after pagination to avoid the 10 000-hit limit.
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
    if (!map.has(id)) map.set(id, doc); // already sorted desc, first = newest
  }
  return Array.from(map.values());
}

// ── Normalise one OpenSearch document into a DB-ready object ─────────────────
function normalise(doc, hostname, agentId) {
  const sca   = doc._source.data.sca;
  const check = sca.check;

  const resultRaw = (check.result || "").toLowerCase();
  let result = resultRaw;
  if (resultRaw.includes("fail"))  result = "failed";
  else if (resultRaw.includes("pass")) result = "passed";
  else if (resultRaw.includes("not"))  result = "not applicable";

  return {
    assetHostname: hostname,
    agentId,
    policy:      sca.policy      || null,
    checkId:     String(check.id || "unknown"),
    title:       check.title      || "",
    result,
    description: check.description || "",
    rationale:   check.rationale   || "",
    remediation: check.remediation || "",
    command:     Array.isArray(check.command) ? check.command : [],
    collectedAt: new Date(doc._source["@timestamp"] || Date.now()),
  };
}

// ── Upsert one agent's checks into MongoDB ────────────────────────────────────
async function upsertChecks(hostname, agentId, normalisedChecks) {
  let saved = 0;
  for (const c of normalisedChecks) {
    await ComplianceCheck.findOneAndUpdate(
      { assetHostname: c.assetHostname, checkId: c.checkId },
      c,
      { upsert: true, new: true }
    );
    saved++;
  }
  return saved;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log("[*] Connecting to MongoDB:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    ComplianceCheck = require("./models/ComplianceCheck");
    console.log("[+] MongoDB connected.");

    for (const agent of AGENTS) {
      console.log(`\n[*] Processing agent ${agent.id} (${agent.hostname})...`);

      let docs;
      try {
        docs = await fetchChecksForAgent(agent.id);
      } catch (e) {
        console.log(`[!] Failed to fetch from indexer for ${agent.hostname}: ${e.message}`);
        continue;
      }

      if (docs.length === 0) {
        console.log(`[!] No SCA check documents found for ${agent.hostname}`);
        continue;
      }

      console.log(`    Raw docs from indexer : ${docs.length}`);

      const unique = deduplicate(docs);
      console.log(`    Unique checks (deduped): ${unique.length}`);

      const normalised = unique.map((d) => normalise(d, agent.hostname, agent.id));

      const failed  = normalised.filter((c) => c.result === "failed").length;
      const passed  = normalised.filter((c) => c.result === "passed").length;
      const notAppl = normalised.filter((c) => c.result === "not applicable").length;

      console.log(`    failed=${failed}  passed=${passed}  not_applicable=${notAppl}`);

      const saved = await upsertChecks(agent.hostname, agent.id, normalised);
      console.log(`[+] ${agent.hostname}: ${saved} checks upserted into MongoDB.`);
    }

    console.log("\n[+] All agents processed. Done.");
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error("[!] Fatal error:", e.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();
