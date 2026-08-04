const router = require("express").Router();
const MaintenanceSchedule = require("../models/MaintenanceSchedule");
const AssetGroup = require("../models/AssetsGroup");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeNextRun(sched) {
  if (!sched || !sched.enabled) return null;
  return `Every ${DAY_NAMES[sched.dayOfWeek]} at ${String(sched.hour).padStart(2, "0")}:${String(sched.minute).padStart(2, "0")}`;
}

// GET /api/maintenance-schedules — read access matches Backlog view
// (admin, compliance-officer, patch-operator, analyst)
router.get("/", requireAuth, requireRole("admin", "compliance-officer", "patch-operator", "analyst"), async (req, res) => {
  try {
    const schedules = await MaintenanceSchedule.find({}).lean();
    const data = schedules.map((s) => ({ ...s, description: describeNextRun(s) }));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// PUT /api/maintenance-schedules/:groupId — create or update a group's schedule
// Admin-only: same gating as group-level patch-all, since this decides WHEN
// that same action fires automatically.
router.put("/:groupId", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { enabled, dayOfWeek, hour, minute } = req.body;
    const group = await AssetGroup.findById(req.params.groupId).lean();
    if (!group) return res.status(404).json({ ok: false, error: "Group not found" });

    const update = {
      enabled: !!enabled,
      dayOfWeek: Number.isInteger(dayOfWeek) ? dayOfWeek : 0,
      hour: Number.isInteger(hour) ? hour : 2,
      minute: Number.isInteger(minute) ? minute : 0,
      createdBy: req.user?.username || "unknown",
    };

    const schedule = await MaintenanceSchedule.findOneAndUpdate(
      { groupId: req.params.groupId },
      { $set: update, $setOnInsert: { groupId: req.params.groupId } },
      { new: true, upsert: true },
    );
    res.json({ ok: true, data: { ...schedule.toObject(), description: describeNextRun(schedule) } });
  } catch (e) {
    console.error("[maintenance-schedules]", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
