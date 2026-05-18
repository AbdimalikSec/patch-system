const mongoose = require("mongoose");

/**
 * AssetGroup — logical grouping of assets by department, function, or location.
 * Groups show aggregated risk scores and compliance posture across all members.
 */
const AssetGroupSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    color:       { type: String, default: "hsl(210,80%,60%)" },
    icon:        { type: String, default: "🗂️" },
    members:     { type: [String], default: [] }, // array of hostnames
    owner:       { type: String, default: "IT" },
  },
  { timestamps: true }
);

module.exports = mongoose.models.AssetGroup ||
  mongoose.model("AssetGroup", AssetGroupSchema);