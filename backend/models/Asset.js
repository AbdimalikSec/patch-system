const mongoose = require("mongoose");

const AssetSchema = new mongoose.Schema(
  {
    hostname: { type: String, required: true },
    os: { type: String, required: true },              // "windows" | "linux"
    ip: { type: String },
    source: { type: String, default: "collector" },     // "collector" | "wazuh"
    lastSeen: { type: Date, default: Date.now },
    raw: { type: Object },                              // store raw JSON safely
  },
  { timestamps: true }
);

module.exports = mongoose.model("Asset", AssetSchema);
