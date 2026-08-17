const AgentCommand = require("./models/AgentCommand");
const { createNotification } = require("./utils/notify");

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // check every 2 minutes

// Two different timeouts, because "never picked up" and "actively working"
// mean very different things. The agent polls every 30 seconds when it's
// genuinely online, so a command sitting untouched for several minutes is a
// real, strong signal the machine is unreachable. But once the agent has
// confirmed it's actively installing something (status: "running"), we
// already know it was alive and working -- a large Windows update can
// legitimately take 20-30+ minutes, and killing it mid-install with a false
// "failed" would be worse than just waiting.
const PENDING_THRESHOLD_MS = 5 * 60 * 1000;   // never started -> 5 minutes
const RUNNING_THRESHOLD_MS = 45 * 60 * 1000;  // confirmed working -> 45 minutes

async function checkStuckCommands() {
  try {
    const pendingCutoff = new Date(Date.now() - PENDING_THRESHOLD_MS);
    const runningCutoff = new Date(Date.now() - RUNNING_THRESHOLD_MS);

    const stuck = await AgentCommand.find({
      $or: [
        { status: "pending", createdAt: { $lte: pendingCutoff } },
        { status: "running", createdAt: { $lte: runningCutoff } },
      ],
    }).lean();

    for (const cmd of stuck) {
      const reason = cmd.status === "pending"
        ? "The agent never picked up this command. The machine may be offline, paused, or unreachable."
        : "The agent started this install but never reported back within 45 minutes. The machine may have gone offline mid-install, or the update genuinely failed silently.";

      await AgentCommand.findByIdAndUpdate(cmd._id, {
        status: "failed",
        completedAt: new Date(),
        output: `${reason} You can safely try again once connectivity is confirmed.`,
      });

      createNotification({
        type: "patch_deployment_failed",
        severity: "warning",
        title: "Patch deployment timed out",
        message: `${cmd.hostname}: ${cmd.kb} timed out (${reason}) Try again once the machine is confirmed online.`,
        targetRoles: ["admin", "patch-operator"],
        relatedHostname: cmd.hostname,
      });
    }
    if (stuck.length > 0) {
      console.log(`[commandTimeoutScheduler] marked ${stuck.length} stuck command(s) as failed`);
    }
  } catch (e) {
    console.error("[commandTimeoutScheduler] check failed:", e.message);
  }
}

function startCommandTimeoutScheduler() {
  console.log("[commandTimeoutScheduler] started, checking every 2 minutes for stuck patch commands");
  setInterval(checkStuckCommands, CHECK_INTERVAL_MS);
}

module.exports = { startCommandTimeoutScheduler };
