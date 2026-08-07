const mongoose = require("mongoose");
const { SUPPORTED_OS } = require("../config/osTypes");

const AgentSchema = new mongoose.Schema(
  {
    // Wazuh agent id (zero-padded string like "001"). Empty until enrolled.
    wazuhId:      { type: String, default: "" },
    hostname:     { type: String, required: true, unique: true, index: true },
    os: { type: String, enum: SUPPORTED_OS, required: true },
    ip:           { type: String, default: "" },

    // Deploy credentials — how Patch Now reaches this machine
    // For windows: agent-based (no creds needed) OR winrm (username/password)
    // For linux: ssh (username + key path)
    deployMethod: { type: String, enum: ["agent", "ssh"], default: "agent" },
    username:     { type: String, default: "" },
    password:     { type: String, default: "" },
    sshKeyPath:   { type: String, default: "" },
    sshPort:      { type: Number, default: 22 },

    // Risk metadata (mirrors AssetMeta fields used by the risk engine)
    // Risk metadata (mirrors AssetMeta fields used by the risk engine)
    criticality:   { type: Number, default: 0.5 },
    role:          { type: String, default: "workstation" },
    exposureLevel: { type: String, enum: ["internet", "dmz", "internal", "isolated"], default: "internal" },
    // Network category — the real structural fact used to gate Asset Group
    // membership. Set explicitly at registration time, not inferred from OS
    // or role, since neither of those actually tells you whether a machine
    // is domain-joined, a standalone physical device, or a dedicated
    // security-testing tool.
    networkCategory: {
      type: String,
      enum: ["domain", "physical", "security"],
      default: "physical",
    },
        // Populated by the OS-validation check, comparing what was declared
    // at registration against what Wazuh actually reports once the agent
    // connects — turning "we trust the form forever" into "we trust it
    // initially, then verify and flag if it's wrong."
    detectedOs: { type: String, default: "" },
    osMismatch: { type: Boolean, default: false },
    osValidatedAt: { type: Date, default: null },
    detectedIp: { type: String, default: "" },
    ipMismatch: { type: Boolean, default: false },
    roleMismatch: { type: Boolean, default: false },
   // Enrollment tracking
    enrolled:    { type: Boolean, default: false }, // true once Wazuh agent checks in
    addedVia:    { type: String, default: "manual" }, // "manual" | "dashboard"
    createdAt:   { type: Date, default: Date.now },
    // Safety flag — set true for infrastructure the platform itself depends on
    // (e.g. PATCH-SRV). Excluded from automated/scheduled patch deployment
    // (maintenance windows, group-level "Patch All") even if it's a member of
    // a group with a window configured. Manual, single-machine patching by a
    // human still works normally regardless of this flag — only automatic
    // paths respect it.
    excludeFromAutoDeploy: { type: Boolean, default: false }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model("Agent", AgentSchema);
