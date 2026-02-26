const mongoose = require("mongoose");

/**
 * AssetMeta
 *
 * Stores static/semi-static context about each asset that cannot be derived
 * from patch or compliance collectors alone.
 *
 * CRITICALITY SCALE (0.0 – 1.0)
 * ──────────────────────────────
 * 0.9 – 1.0  Critical   Infrastructure backbone (DC, core servers)
 * 0.7 – 0.8  High       Important servers, security management plane
 * 0.4 – 0.6  Medium     Standard workstations, user endpoints
 * 0.1 – 0.3  Low        Test/lab machines, isolated systems
 *
 * EXPOSURE TIER
 * ─────────────
 * internal_critical  : No internet access, but compromise = catastrophic
 * internal_standard  : Normal internal workstation/server
 * isolated_lab       : Intentionally isolated test environment
 * internet_facing    : Directly reachable from internet (future use)
 */
const AssetMetaSchema = new mongoose.Schema(
  {
    hostname:     { type: String, required: true, unique: true, index: true },

    // Role classification
    role: {
      type: String,
      default: "workstation",
      enum: [
        "workstation",
        "domain_controller",
        "server",
        "security_server",
        "security_testing",
        "network_device",
      ],
    },

    owner:        { type: String, default: "IT" },

    // Core risk weight — see scale above
    criticality:  { type: Number, default: 0.4, min: 0, max: 1 },

    // Exposure context
    exposureTier: {
      type: String,
      default: "internal_standard",
      enum: [
        "internet_facing",
        "internal_critical",
        "internal_standard",
        "isolated_lab",
      ],
    },

    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AssetMeta", AssetMetaSchema);