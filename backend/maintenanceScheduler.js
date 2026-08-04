const MaintenanceSchedule = require("./models/MaintenanceSchedule");
const AssetGroup = require("./models/AssetsGroup");
const { deployAllMissingForHost } = require("./routes/deploy");

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

async function checkAndRunSchedules() {
  try {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const due = await MaintenanceSchedule.find({
      enabled: true,
      dayOfWeek: currentDay,
      hour: currentHour,
    }).lean();

    for (const sched of due) {
      // Match within the 5-minute check window, and guard against firing
      // twice in the same window if the check overlaps a restart.
      if (Math.abs(sched.minute - currentMinute) > 5) continue;
      if (sched.lastRunAt) {
        const hoursSinceLastRun = (now - new Date(sched.lastRunAt)) / (1000 * 60 * 60);
        if (hoursSinceLastRun < 24) continue; // already ran today/this window
      }

      const group = await AssetGroup.findById(sched.groupId).lean();
      if (!group || !group.members || group.members.length === 0) continue;

      console.log(`[maintenanceScheduler] Running scheduled patch window for group "${group.name}" (${group.members.length} machines)`);

      for (const hostname of group.members) {
        try {
          await deployAllMissingForHost(hostname, "scheduled-maintenance", null);
        } catch (e) {
          console.error(`[maintenanceScheduler] Failed deploying to ${hostname}:`, e.message);
        }
      }

      await MaintenanceSchedule.findByIdAndUpdate(sched._id, { lastRunAt: now });
    }
  } catch (e) {
    console.error("[maintenanceScheduler] check failed:", e.message);
  }
}

function startMaintenanceScheduler() {
  console.log("[maintenanceScheduler] started, checking every 5 minutes");
  setInterval(checkAndRunSchedules, CHECK_INTERVAL_MS);
}

module.exports = { startMaintenanceScheduler };
