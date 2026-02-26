const mongoose = require("mongoose");

const ComplianceCheckSchema = new mongoose.Schema(
  {
    assetHostname: { type: String, required: true, index: true },
    policy: { type: String, default: null },

    checkId: { type: String, required: true },
    title: { type: String },
    result: { type: String }, // passed | failed | not applicable | invalid

    description: { type: String },
    rationale: { type: String },
    remediation: { type: String },
    command: { type: Array, default: [] },

    collectedAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

// Prevent duplicates per host + checkId
ComplianceCheckSchema.index({ assetHostname: 1, checkId: 1 }, { unique: true });

module.exports = mongoose.model("ComplianceCheck", ComplianceCheckSchema);