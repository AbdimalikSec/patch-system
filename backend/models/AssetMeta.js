const mongoose = require("mongoose");

const AssetMetaSchema = new mongoose.Schema(
  {
    hostname:    { type: String, required: true, unique: true, index: true },
    role: {
      type: String, default: "workstation",
      enum: ["workstation","domain_controller","server","security_server","web_server","test_machine","other"],
    },
    os_type:         { type: String, default: "unknown" },
    owner:           { type: String, default: "IT" },
    criticality:     { type: Number, default: 0.5, min: 0, max: 1 },
    internet_facing: { type: Boolean, default: false },

    // Network exposure — drives ExposureMultiplier in risk formula
    // internet=1.0, dmz=0.8, internal=0.5, isolated=0.2
    exposureLevel: {
      type: String, default: "internal",
      enum: ["internet", "dmz", "internal", "isolated"],
    },

    // Network zone — used in the network map UI
    networkZone: {
      type: String, default: "servers",
      enum: ["internet", "dmz", "staff", "servers", "isolated"],
    },

    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AssetMeta", AssetMetaSchema);