const mongoose = require("mongoose");

const userActivitySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  username:  { type: String },
  action:    { type: String },
  target:    { type: String },
  ip:        { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("UserActivity", userActivitySchema);
