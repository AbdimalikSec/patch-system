const mongoose = require("mongoose");

const AgentCommandSchema = new mongoose.Schema({
  hostname:    { type: String, required: true, index: true },
  kb:          { type: String, required: true },
  type:        { type: String, default: "patch", enum: ["patch", "restart"] },
  status:      { type: String, default: "pending", enum: ["pending", "running", "success", "failed"] },
  output:      { type: String, default: "" },
  createdAt:   { type: Date, default: Date.now },
  completedAt: { type: Date },
});

module.exports = mongoose.model("AgentCommand", AgentCommandSchema);