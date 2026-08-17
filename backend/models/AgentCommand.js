const mongoose = require("mongoose");

const AgentCommandSchema = new mongoose.Schema({
  hostname:    { type: String, required: true, index: true },
  kb:          { type: String, required: true },
  type:        { type: String, default: "patch", enum: ["patch", "restart"] },
  status:      { type: String, default: "pending", enum: ["pending", "running", "success", "failed"] },
  triggeredBy:   { type: String, default: "" },   // username of who clicked Patch Now / Restart
  output:      { type: String, default: "" },
  createdAt:   { type: Date, default: Date.now },
  completedAt: { type: Date },
}, {
  // Only auto-manage updatedAt -- createdAt is already a manual field above
  // and every scheduler tonight depends on it staying exactly as-is;
  // updatedAt gives us a real "when did status last actually change" value,
  // which is what the running-command timeout needs to measure from.
  timestamps: { createdAt: false, updatedAt: true },
});

module.exports = mongoose.model("AgentCommand", AgentCommandSchema);
