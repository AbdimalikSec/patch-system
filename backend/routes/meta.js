/**
 * seed_asset_meta.js
 *
 * Seeds AssetMeta collection with role, criticality, owner, and exposure tier
 * for every known asset in the lab environment.
 *
 * Run once (safe to re-run — uses upsert):
 *   node seed_asset_meta.js
 *
 * CRITICALITY JUSTIFICATION (Academic)
 * ─────────────────────────────────────
 * Criticality is scored 0.0–1.0 based on three dimensions:
 *   1. Business Impact  — what breaks if this asset is compromised
 *   2. Data Sensitivity — what data the asset holds or processes
 *   3. Recovery Cost    — how long/expensive to restore service
 *
 * Tier mapping:
 *   Critical  (0.9–1.0) : Infrastructure backbone, single point of failure
 *   High      (0.7–0.8) : Important servers, management planes
 *   Medium    (0.4–0.6) : Standard workstations, user endpoints
 *   Low       (0.1–0.3) : Test/lab machines, isolated systems
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AssetMeta = require("./models/AssetMeta");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/riskpatchdb";

// ── Asset definitions ─────────────────────────────────────────────────────────
// hostname must match EXACTLY what appears in MongoDB (case-sensitive)
const ASSETS = [
  {
    hostname: "DC1",
    role: "domain_controller",
    owner: "IT Infrastructure",
    criticality: 1.0,
    exposureTier: "internal_critical",
    notes: [
      "Active Directory Domain Controller for the entire domain.",
      "Compromise = full domain takeover.",
      "Criticality: 1.0 — highest possible.",
      "Business impact: ALL domain-joined assets affected.",
      "Data sensitivity: Credential hashes, GPO, DNS, DHCP.",
      "Recovery cost: Days to weeks (AD rebuild).",
    ].join(" "),
  },
  {
    hostname: "Wazuh",
    role: "security_server",
    owner: "IT Security",
    criticality: 0.9,
    exposureTier: "internal_critical",
    notes: [
      "Wazuh SIEM/XDR manager — security visibility platform.",
      "Compromise = blind to all security events across estate.",
      "Criticality: 0.9 — security management plane.",
      "Business impact: Loss of threat detection and compliance monitoring.",
      "Data sensitivity: Security logs, agent credentials, alert data.",
      "Recovery cost: 1-2 days (reinstall + re-enroll agents).",
    ].join(" "),
  },
  {
    hostname: "HQ-STAFF-01",
    role: "workstation",
    owner: "End User Computing",
    criticality: 0.5,
    exposureTier: "internal_standard",
    notes: [
      "Standard HQ staff workstation.",
      "Criticality: 0.5 — medium tier endpoint.",
      "Business impact: Single user productivity loss.",
      "Data sensitivity: User documents, cached credentials.",
      "Recovery cost: Hours (re-image from gold image).",
      "Risk elevated if user has elevated privileges.",
    ].join(" "),
  },
  {
    hostname: "BR-staff",
    role: "workstation",
    owner: "End User Computing",
    criticality: 0.4,
    exposureTier: "internal_standard",
    notes: [
      "Branch office staff workstation.",
      "Criticality: 0.4 — standard endpoint, remote branch.",
      "Business impact: Single user at branch site.",
      "Data sensitivity: User documents, local cached data.",
      "Recovery cost: Hours (re-image).",
      "Lower criticality than HQ due to branch isolation.",
    ].join(" "),
  },
  {
    hostname: "kali",
    role: "security_testing",
    owner: "IT Security",
    criticality: 0.2,
    exposureTier: "isolated_lab",
    notes: [
      "Kali Linux penetration testing / security lab machine.",
      "Criticality: 0.2 — intentionally low, isolated lab system.",
      "Not part of production environment.",
      "High patch count and compliance failures are EXPECTED.",
      "Business impact: Negligible (lab asset).",
      "Data sensitivity: Low (test data only).",
      "NOTE: Risk scores for this asset should be interpreted differently.",
    ].join(" "),
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log("[*] Connecting to MongoDB:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("[+] Connected.\n");

    for (const asset of ASSETS) {
      const doc = await AssetMeta.findOneAndUpdate(
        { hostname: asset.hostname },
        asset,
        { upsert: true, returnDocument: "after" }
      );
      console.log(
        `[+] ${asset.hostname.padEnd(15)} role=${asset.role.padEnd(20)} criticality=${asset.criticality}`
      );
    }

    console.log("\n[+] Asset meta seeded successfully.");
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error("[!] Error:", e.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();