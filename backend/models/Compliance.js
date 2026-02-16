const mongoose = require("mongoose");

const ComplianceSchema = new mongoose.Schema(
  {
    assetHostname: { type: String, required: true, index: true },
    source: { type: String, default: "wazuh" },
    collectedAt: { type: Date, default: Date.now, index: true },
    score: { type: Number, default: 100 },     // optional
    failedCount: { type: Number, default: 0 },
    failed: { type: Array, default: [] },      // failed checks/policies
    raw: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Compliance", ComplianceSchema);
