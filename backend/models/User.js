const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true },
  role:      { type: String, enum: ["admin", "analyst", "auditor"], default: "analyst" },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", UserSchema);