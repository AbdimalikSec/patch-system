const mongoose = require("mongoose");

const AssetSchema = new mongoose.Schema({
  hostname: String,
  os: String,
  ip: String,
  patches: Object,
  compliance: Object,
  riskScore: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Asset", AssetSchema);
