const mongoose = require("mongoose");

const AgentSchema = new mongoose.Schema(
  {
    // Wazuh agent id (zero-padded string like "001"). Empty until enrolled.
    wazuhId:      { type: String, default: "" },
    hostname:     { type: String, required: true, unique: true, index: true },
    os:           { type: String, enum: ["windows", "linux"], required: true },
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
    criticality:   { type: Number, default: 0.5 },
    role:          { type: String, default: "workstation" },
    exposureLevel: { type: String, enum: ["internet", "dmz", "internal", "isolated"], default: "internal" },

    // Enrollment tracking
    enrolled:    { type: Boolean, default: false }, // true once Wazuh agent checks in
    addedVia:    { type: String, default: "manual" }, // "manual" | "dashboard"
    createdAt:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Agent", AgentSchema);
