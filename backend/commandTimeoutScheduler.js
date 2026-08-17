const AgentCommand = require("./models/AgentCommand");
const { createNotification } = require("./utils/notify");

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // check every 2 minutes
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes with no response = give up

async function checkStuckCommands() {
  try {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
    const stuck = await AgentCommand.find({
      status: { $in: ["pending", "running"] },
      createdAt: { $lte: cutoff },
    }).lean();

    for (const cmd of stuck) {
      await AgentCommand.findByIdAndUpdate(cmd._id, {
        status: "failed",
        completedAt: new Date(),
        output: "No response from the agent within 10 minutes. The machine may be offline, paused, or unreachable. You can safely try again once connectivity is confirmed.",
      });

      createNotification({
        type: "patch_deployment_failed",
        severity: "warning",
        title: "Patch deployment timed out",
        message: `${cmd.hostname}: ${cmd.kb} never reported back within 10 minutes and has been marked failed. Try again once the machine is confirmed online.`,
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
