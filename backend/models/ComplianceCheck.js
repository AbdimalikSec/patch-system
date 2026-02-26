const mongoose = require("mongoose");

const ComplianceCheckSchema = new mongoose.Schema(
  {
    assetHostname: { type: String, required: true, index: true },
    agentId:       { type: String, required: true },
    policy:        { type: String, default: null },

    checkId:       { type: String, required: true },
    title:         { type: String, default: "" },
    result:        { type: String, default: "" }, // passed | failed | not applicable

    description:   { type: String, default: "" },
    rationale:     { type: String, default: "" },
    remediation:   { type: String, default: "" },
    command:       { type: Array,  default: [] },

    collectedAt:   { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// One record per host + checkId — upsert will update it on every collection run
ComplianceCheckSchema.index({ assetHostname: 1, checkId: 1 }, { unique: true });

module.exports = mongoose.model("ComplianceCheck", ComplianceCheckSchema);