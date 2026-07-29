const mongoose = require("mongoose");

// One record per GENUINE result transition — written only when a check's
// result actually changes, not on every collector run. This is the permanent
// audit trail of compliance fixes and regressions, independent of whether a
// ticket was ever created for the check.
const ComplianceHistorySchema = new mongoose.Schema(
  {
    assetHostname: { type: String, required: true, index: true },
    checkId:       { type: String, required: true, index: true },
    title:         { type: String, default: "" },
    policy:        { type: String, default: null },
    fromResult:    { type: String, default: "" }, // what it was before (empty if first-ever seen)
    toResult:      { type: String, required: true }, // what it changed to
    changedAt:     { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ComplianceHistory", ComplianceHistorySchema);
