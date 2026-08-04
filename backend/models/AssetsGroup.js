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
    // Gates which machines are eligible to join this group, and enables
    // real exclusivity enforcement (a machine can only belong to one
    // category-gated group at a time). "custom" groups have no eligibility
    // restriction — for organizational groupings unrelated to network
    // category, e.g. a "Finance Department" group.
    category: {
      type: String,
      enum: ["domain", "physical", "security", "custom"],
      default: "custom",
    },
  },
  { timestamps: true }
);
module.exports = mongoose.models.AssetGroup ||
  mongoose.model("AssetGroup", AssetGroupSchema);
