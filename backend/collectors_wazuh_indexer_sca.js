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

const https = require("https");
const axios = require("axios");
const mongoose = require("mongoose");

// ── Config ────────────────────────────────────────────────────────────────────
const WAZUH_API_URL = process.env.WAZUH_API_URL || "https://192.168.0.20:55000";
const WAZUH_API_USER = process.env.WAZUH_API_USER || "riskpatch-api";
const WAZUH_API_PASS = process.env.WAZUH_API_PASS || "passwordsS3*";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/riskpatch";

// Agent id → hostname mapping — keeps queries fast and avoids duplicate names.
// Add every agent you have here. id is the Wazuh agent id (string, zero-padded).
const Agent = require("./models/Agent");
const dataSourceType = process.env.DATA_SOURCE_TYPE || "wazuh";
const dataSourceAdapter = require(`./adapters/${dataSourceType === "wazuh" ? "WazuhAdapter" : "WazuhAdapter"}`);

// ── Mongoose model (loaded after DB connect) ──────────────────────────────────
let ComplianceCheck;
let ComplianceHistory;
const { createNotification } = require("./utils/notify");
// ── Auto-link DB machines to their Wazuh agent ID by hostname ─────────────────
async function autoLinkAgents() {
  try {
    // Get a Wazuh manager API token
    const wazuhClient = axios.create({
      baseURL: WAZUH_API_URL,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 15000,
    });
    const basic = Buffer.from(`${WAZUH_API_USER}:${WAZUH_API_PASS}`).toString("base64");
    const tokenRes = await wazuhClient.post("/security/user/authenticate", null, {
      headers: { Authorization: `Basic ${basic}` },
    });
    const token = tokenRes.data?.data?.token;
    if (!token) {
      console.log("[!] Could not get Wazuh token for auto-link");
      return;
    }

    // Get all agents from Wazuh (id + name)
    const agentsRes = await wazuhClient.get("/agents?limit=500", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const wazuhAgents = agentsRes.data?.data?.affected_items || [];

    // Match each DB machine to its Wazuh agent by hostname (case-insensitive)
     // Match every DB machine to its Wazuh agent by hostname (case-insensitive),
    // including archived ones -- an archived machine whose Wazuh agent is
    // confirmed genuinely Active again is a legitimate, trusted signal to
    // bring it back, unlike the plain, unauthenticated collector POST.
     // Match every DB machine to its Wazuh agent by hostname (case-insensitive),
    // including archived ones -- an archived machine whose Wazuh agent is
    // confirmed genuinely Active again is a legitimate, trusted signal to
    // bring it back, unlike the plain, unauthenticated collector POST.
    const dbMachines = await Agent.find({}).lean();
    let linked = 0;
    for (const m of dbMachines) {
      const match = wazuhAgents.find(
        (wa) => (wa.name || "").toLowerCase() === m.hostname.toLowerCase()
      );
      if (match && match.id !== "000" && match.status === "active") {
        const wasArchived = m.archived;
        // Update if wazuhId is missing/wrong, not yet enrolled, or archived
        if (m.wazuhId !== match.id || !m.enrolled || m.archived) {
          await Agent.updateOne(
            { _id: m._id },
            { wazuhId: match.id, enrolled: true, archived: false, archivedAt: null }
          );
          console.log(
            wasArchived
              ? `[+] Revived ${m.hostname} -- Wazuh confirms it is active again -> new Wazuh ID ${match.id}`
              : `[+] Auto-linked ${m.hostname} -> Wazuh ID ${match.id} (enrolled)`
          );
          linked++;
        }
      }
    }
    if (linked === 0) console.log("[*] Auto-link: all machines already linked");
  } catch (e) {
    console.log(`[!] Auto-link failed: ${e.message}`);
  }
}


// ── Upsert one agent's checks into MongoDB ────────────────────────────────────
async function upsertChecks(hostname, agentId, normalisedChecks) {
  let saved = 0;
    for (const c of normalisedChecks) {
    const existing = await ComplianceCheck.findOne(
      { assetHostname: c.assetHostname, checkId: c.checkId },
      { result: 1 },
    ).lean();

    const isTransition = existing && existing.result !== c.result;
    const update = isTransition
      ? { ...c, statusChangedAt: new Date() }
      : existing
      ? c // existing, no change — leave statusChangedAt as-is
      : { ...c, statusChangedAt: new Date(0) }; // first-time baseline — old timestamp so it's not "new"

    await ComplianceCheck.findOneAndUpdate(
      { assetHostname: c.assetHostname, checkId: c.checkId },
      update,
      { upsert: true, new: true },
    );
    saved++;

    // Record a permanent history entry on every GENUINE transition — this is
    // independent of whether a ticket exists for this check, so compliance
    // fixes/regressions are always tracked.
     if (isTransition) {
      try {
        await ComplianceHistory.create({
          assetHostname: c.assetHostname,
          checkId: c.checkId,
          title: c.title,
          policy: c.policy,
          fromResult: existing.result,
          toResult: c.result,
          changedAt: new Date(),
        });

        // Real fix or real regression -- either way, someone should know
        // without having to notice it themselves on the dashboard.
        if (existing.result === "failed" && c.result === "passed") {
          createNotification({
            type: "compliance_fixed",
            severity: "info",
            title: "Compliance check fixed",
            message: `${c.assetHostname}: "${c.title}" now passes.`,
            targetRoles: ["admin", "compliance-officer"],
            relatedHostname: c.assetHostname,
          });
        } else if (existing.result === "passed" && c.result === "failed") {
          createNotification({
            type: "compliance_new_failure",
            severity: "warning",
            title: "New compliance failure detected",
            message: `${c.assetHostname}: "${c.title}" is now failing.`,
            targetRoles: ["admin", "compliance-officer"],
            relatedHostname: c.assetHostname,
          });
        }
      } catch (e) {
        console.log(`[!] Failed to write compliance history for ${c.assetHostname}/${c.checkId}: ${e.message}`);
      }
    }
  }
  return saved;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log("[*] Connecting to MongoDB:", MONGO_URI); 
   await mongoose.connect(MONGO_URI);
    ComplianceCheck = require("./models/ComplianceCheck");
    ComplianceHistory = require("./models/ComplianceHistory");
     console.log("[+] MongoDB connected.");

    // Auto-link any newly-enrolled machines to their Wazuh agent ID
    await autoLinkAgents();

    // Load agents from the database (only enrolled ones with a Wazuh id)
    const dbAgents = await Agent.find({ wazuhId: { $ne: "" } }).lean();
    const AGENTS = dbAgents.map(a => ({ id: a.wazuhId, hostname: a.hostname }));
    console.log(`[*] Loaded ${AGENTS.length} agents from database`);

    for (const agent of AGENTS) {
      console.log(`\n[*] Processing agent ${agent.id} (${agent.hostname})...`);

      let normalised;
      try {
        normalised = await dataSourceAdapter.getComplianceResults(agent.id, agent.hostname);
      } catch (e) {
        console.log(
          `[!] Failed to fetch from data source for ${agent.hostname}: ${e.message}`,
        );
        continue;
      }

      if (normalised.length === 0) {
        console.log(`[!] No compliance check data found for ${agent.hostname}`);
        continue;
      }

      console.log(`    Checks retrieved (deduped): ${normalised.length}`);

      const failed = normalised.filter((c) => c.result === "failed").length;
      const passed = normalised.filter((c) => c.result === "passed").length;
      const notAppl = normalised.filter(
        (c) => c.result === "not applicable",
      ).length;

      console.log(
        `    failed=${failed}  passed=${passed}  not_applicable=${notAppl}`,
      );

      const saved = await upsertChecks(agent.hostname, agent.id, normalised);
      console.log(
        `[+] ${agent.hostname}: ${saved} checks upserted into MongoDB.`,
      );
    }

    console.log("\n[+] All agents processed. Done.");

    // Auto-resolve tickets where the check is now passing
    async function autoResolveTickets() {
      try {
        const Ticket = require("./models/Ticket");
        //// ComplianceCheck is already loaded at module level
      //  const ComplianceCheck = require("./models/ComplianceCheck");
        const openTickets = await Ticket.find({
          status: { $in: ["open", "in-progress"] },
        });
        let resolved = 0;
        for (const ticket of openTickets) {
          const check = await ComplianceCheck.findOne({
            assetHostname: ticket.assetHostname,
            checkId: ticket.checkId,
            result: "passed",
          });
          if (check) {
            await Ticket.findByIdAndUpdate(ticket._id, {
              status: "resolved",
              resolvedAt: new Date(),
              notes:
                (ticket.notes ? ticket.notes + " | " : "") +
                "Auto-resolved: check now passing",
            });
            resolved++;
            console.log(
              `[ticket] Auto-resolved: ${ticket.assetHostname} check ${ticket.checkId}`,
            );
          }
        }
        if (resolved > 0)
          console.log(`[ticket] ${resolved} ticket(s) auto-resolved`);
      } catch (e) {
        console.error("[ticket] Auto-resolve error:", e.message);
      }
    }

    await autoResolveTickets();

    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error("[!] Fatal error:", e.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();
