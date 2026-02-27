/**
 * seed_asset_meta.js  (v2 — corrected asset roles)
 *
 * Changes from v1:
 *   - BR-staff REMOVED from all collections (VM deleted, ghost agent)
 *   - kali: role = workstation, criticality = 0.6 (real security endpoint)
 *   - HQ-STAFF-01: notes updated to reflect domain-joined status
 *
 * Run: node seed_asset_meta.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AssetMeta = require("./models/AssetMeta");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/riskpatchdb";

const GHOST_HOSTNAMES = ["BR-staff"];

const ASSETS = [
  {
    hostname: "DC1",
    role: "domain_controller",
    owner: "IT Infrastructure",
    criticality: 1.0,
    internet_facing: false,
    os_type: "windows",
    notes: "Primary Domain Controller. Runs Active Directory, DNS, and Group Policy for the domain. All domain-joined assets authenticate through this server. Highest criticality asset in the environment.",
  },
  {
    hostname: "Wazuh",
    role: "security_server",
    owner: "IT Security",
    criticality: 0.8,
    internet_facing: false,
    os_type: "linux",
    notes: "Wazuh SIEM/XDR manager. Hosts centralised security monitoring, log aggregation, SCA scanning, and alerting for all agents. High criticality due to security infrastructure role.",
  },
  {
    hostname: "HQ-STAFF-01",
    role: "workstation",
    owner: "End Users",
    criticality: 0.5,
    internet_facing: false,
    os_type: "windows",
    notes: "Domain-joined staff workstation at HQ. Member of the Active Directory domain managed by DC1. Medium criticality — potential lateral movement vector if compromised due to domain membership.",
  },
  {
    hostname: "kali",
    role: "workstation",
    owner: "IT Security",
    criticality: 0.6,
    internet_facing: false,
    os_type: "linux",
    notes: "Security workstation running Kali Linux. Used for security testing and operations within the lab environment. Slightly elevated criticality as it contains security tooling.",
  },
];

(async () => {
  try {
    console.log("[*] Connecting to MongoDB:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("[+] Connected.\n");

    // ── Remove ghost agents from ALL collections ───────────────────────────
    console.log("[*] Removing ghost agents...");
    for (const ghost of GHOST_HOSTNAMES) {
      const regex = new RegExp(`^${ghost}$`, "i");

      const r1 = await mongoose.connection.collection("assets").deleteMany({ hostname: regex });
      const r2 = await mongoose.connection.collection("patches").deleteMany({ assetHostname: regex });
      const r3 = await mongoose.connection.collection("compliances").deleteMany({ assetHostname: regex });
      const r4 = await mongoose.connection.collection("compliancechecks").deleteMany({ assetHostname: regex });
      const r5 = await mongoose.connection.collection("risks").deleteMany({ hostname: regex });
      const r6 = await AssetMeta.deleteMany({ hostname: regex });

      console.log(`[+] Purged "${ghost}": assets=${r1.deletedCount} patches=${r2.deletedCount} compliance=${r3.deletedCount} checks=${r4.deletedCount} risks=${r5.deletedCount} meta=${r6.deletedCount}`);
    }

    console.log("");

    // ── Upsert active assets ───────────────────────────────────────────────
    console.log("[*] Seeding active assets...");
    for (const asset of ASSETS) {
      await AssetMeta.findOneAndUpdate(
        { hostname: asset.hostname },
        asset,
        { upsert: true, returnDocument: "after" }
      );
      console.log(`[+] ${asset.hostname.padEnd(15)} role=${asset.role.padEnd(20)} criticality=${asset.criticality}`);
    }

    console.log("\n[+] All done.");
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error("[!] Error:", e.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();