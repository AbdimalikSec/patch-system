/**
 * migrate_agents.js
 * One-time script: loads your existing 3 hardcoded agents into the new
 * Agent collection in MongoDB. Safe to run more than once (upserts by hostname).
 *
 * Run:  node migrate_agents.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Agent = require("./models/Agent");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/riskpatchdb";

// Your existing 3 machines, with everything known about them today.
const EXISTING = [
  {
    wazuhId: "001",
    hostname: "DC1",
    os: "windows",
    ip: "192.168.0.10",
    deployMethod: "winrm",
    username: "Administrator",
    password: "15422035s$",
    criticality: 1.0,
    role: "domain controller",
    exposureLevel: "internal",
    enrolled: true,
    addedVia: "manual",
  },
  {
    wazuhId: "004",
    hostname: "HQ-staff-01",
    os: "windows",
    ip: "192.168.0.50",
    deployMethod: "winrm",
    username: "hqSaacid",
    password: "passwordS$",
    criticality: 0.5,
    role: "workstation",
    exposureLevel: "internal",
    enrolled: true,
    addedVia: "manual",
  },
  {
    wazuhId: "005",
    hostname: "kali",
    os: "linux",
    ip: "192.168.0.62",
    deployMethod: "ssh",
    username: "stager",
    sshKeyPath: "/home/patch/.ssh/patch_key",
    sshPort: 22,
    criticality: 0.6,
    role: "security workstation",
    exposureLevel: "internet",
    enrolled: true,
    addedVia: "manual",
  },
];

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log("[*] Connected to MongoDB");

  for (const a of EXISTING) {
    const doc = await Agent.findOneAndUpdate(
      { hostname: a.hostname },
      a,
      { upsert: true, new: true }
    );
    console.log(`[+] ${doc.hostname} (wazuhId ${doc.wazuhId}, ${doc.os}) saved`);
  }

  const count = await Agent.countDocuments();
  console.log(`[*] Agent collection now has ${count} machines`);
  await mongoose.disconnect();
  console.log("[+] Done");
  process.exit(0);
})().catch((e) => {
  console.error("[!] Error:", e.message);
  process.exit(1);
});
