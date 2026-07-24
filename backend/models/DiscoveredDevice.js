const mongoose = require("mongoose");

const DiscoveredDeviceSchema = new mongoose.Schema({
  ip:        { type: String, required: true, unique: true, index: true },
  subnet:    { type: String, default: "", index: true },
  mac:       { type: String, default: "" },
  vendor:    { type: String, default: "" },
  hostname:  { type: String, default: "" },
  firstSeen: { type: Date, default: Date.now },
  lastSeen:  { type: Date, default: Date.now },
});

module.exports = mongoose.model("DiscoveredDevice", DiscoveredDeviceSchema);
