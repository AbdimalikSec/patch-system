const mongoose = require("mongoose");

/**
 * AssetMeta — stores contextual metadata about each asset.
 *
 * Criticality (0.0–1.0) is the primary risk multiplier in the risk engine.
 * Values are defined per NIST SP 800-30 asset valuation guidelines:
 *
 *   1.0  Critical  — Domain controllers, authentication servers
 *   0.8  High      — Security infrastructure, patch servers
 *   0.5  Medium    — Standard workstations, staff endpoints
 *   0.3  Low       — Test machines, non-production systems
 */
const AssetMetaSchema = new mongoose.Schema(
  {
    hostname:        { type: String, required: true, unique: true, index: true },

    // Asset classification
    role: {
      type: String,
      default: "workstation",
      enum: [
        "workstation",
        "domain_controller",
        "server",
        "security_server",
        "test_machine",
        "other",
      ],
    },
    os_type:         { type: String, default: "unknown" }, // windows | linux | unknown
    owner:           { type: String, default: "IT" },

    // Risk engine inputs
    criticality:     { type: Number, default: 0.5, min: 0, max: 1 },
    internet_facing: { type: Boolean, default: false },

    // Free-text notes (shown in UI and used in reports)
    notes:           { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AssetMeta", AssetMetaSchema);