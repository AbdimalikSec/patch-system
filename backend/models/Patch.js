const mongoose = require("mongoose");

const PatchSchema = new mongoose.Schema(
  {
    assetHostname: { type: String, required: true, index: true },
    os: { type: String, required: true }, // windows|linux
    collectedAt: { type: Date, default: Date.now, index: true },
    missingCount: { type: Number, default: 0 },
    missing: { type: Array, default: [] }, // list of missing updates/packages
    raw: { type: Object }, // full collector output
  },
  { timestamps: true }
);

module.exports = mongoose.model("Patch", PatchSchema);
