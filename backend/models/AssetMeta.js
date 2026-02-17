const mongoose = require("mongoose");

const AssetMetaSchema = new mongoose.Schema(
  {
    hostname: { type: String, required: true, unique: true, index: true },
    role: { type: String, default: "workstation" }, // workstation | domain_controller | server
    owner: { type: String, default: "IT" },
    criticality: { type: Number, default: 0.4 },    // 0.0 - 1.0
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AssetMeta", AssetMetaSchema);
