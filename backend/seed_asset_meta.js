/**
 * seed_asset_meta.js
 *
 * One-time script to populate AssetMeta with correct roles and criticality
 * values for all known assets in the lab environment.
 *
 * Criticality scale (0.0 – 1.0) justified by NIST SP 800-30 asset valuation:
 *   1.0  — Critical infrastructure (Domain Controller, auth services)
 *   0.8  — High (servers, patch management infrastructure)
 *   0.5  — Medium (standard workstations, staff PCs)
 *   0.3  — Low (test/research machines, non-production)
 *
 * Run once:  node seed_asset_meta.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AssetMeta = require("./models/AssetMeta");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/riskpatchdb";

// ── Asset definitions ─────────────────────────────────────────────────────────
// Hostnames must match EXACTLY what appears in MongoDB (case-sensitive).
const ASSETS = [
  {
    hostname: "DC1",
    role: "domain_controller",
    owner: "IT Infrastructure",
    criticality: 1.0,
    internet_facing: false,
    os_type: "windows",
    notes: "Primary Domain Controller. Manages all authentication, Group Policy, and DNS for the domain. Compromise would affect all domain-joined assets.",
  },
  {
    hostname: "Wazuh",
    role: "security_server",
    owner: "IT Security",
    criticality: 0.8,
    internet_facing: false,
    os_type: "linux",
    notes: "Wazuh SIEM/XDR manager. Hosts security monitoring, log aggregation, and SCA scanning. High criticality due to security infrastructure role.",
  },
  {
    hostname: "HQ-STAFF-01",
    role: "workstation",
    owner: "End Users",
    criticality: 0.5,
    internet_facing: false,
    os_type: "windows",
    notes: "Standard HQ staff workstation. Medium criticality — potential lateral movement vector if compromised.",
  },
  {
    hostname: "BR-staff",
    role: "workstation",
    owner: "End Users",
    criticality: 0.5,
    internet_facing: false,
    os_type: "windows",
    notes: "Branch office staff workstation. Medium criticality — remote office endpoint.",
  },
  {
    hostname: "kali",
    role: "test_machine",
    owner: "IT Security",
    criticality: 0.3,
    internet_facing: false,
    os_type: "linux",
    notes: "Security testing and research machine. Low criticality in production context — not domain-joined, no sensitive data.",
  },
];

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
      console.log(`[+] ${asset.hostname.padEnd(15)} role=${asset.role.padEnd(20)} criticality=${asset.criticality}`);
    }

    console.log("\n[+] All assets seeded.");
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error("[!] Error:", e.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();