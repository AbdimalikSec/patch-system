const mongoose = require("mongoose");

/**
 * MaintenanceSchedule — one optional automatic patch window per Asset Group.
 * Deliberately a separate collection from AssetGroup: compliance-officer can
 * view and edit groups themselves, but deciding WHEN a group auto-patches is
 * an admin-only operational decision, same class as triggering a patch
 * manually — so this lives in its own collection with its own permissions.
 */
const MaintenanceScheduleSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "AssetGroup", required: true, unique: true },
    enabled: { type: Boolean, default: false },
    dayOfWeek: { type: Number, min: 0, max: 6, default: 0 }, // 0 = Sunday
    hour: { type: Number, min: 0, max: 23, default: 2 },
    minute: { type: Number, min: 0, max: 59, default: 0 },
    lastRunAt: { type: Date, default: null },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MaintenanceSchedule", MaintenanceScheduleSchema);
