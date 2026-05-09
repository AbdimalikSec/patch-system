const mongoose = require("mongoose");

const RiskSnapshotSchema = new mongoose.Schema({
  assetHostname: { type: String, required: true, index: true },
  snapshotDate:  { type: String, required: true, index: true }, // "YYYY-MM-DD"
  score:         { type: Number, default: 0 },
  priority:      { type: String, default: "Low" },
  missingCount:  { type: Number, default: 0 },
  failedCount:   { type: Number, default: 0 },
  cveCount:      { type: Number, default: 0 },
  patchAgeDays:  { type: Number, default: 0 },
  recordedAt:    { type: Date, default: Date.now },
}, { timestamps: true });

// One snapshot per asset per day
RiskSnapshotSchema.index({ assetHostname: 1, snapshotDate: 1 }, { unique: true });

module.exports = mongoose.models.RiskSnapshot ||
  mongoose.model("RiskSnapshot", RiskSnapshotSchema);