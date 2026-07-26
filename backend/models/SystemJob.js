const mongoose = require("mongoose");

const SystemJobSchema = new mongoose.Schema({
  jobName:     { type: String, required: true, index: true },
  status:      { type: String, default: "running", enum: ["running", "success", "failed"] },
  output:      { type: String, default: "" },
  startedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date },
});

module.exports = mongoose.model("SystemJob", SystemJobSchema);
