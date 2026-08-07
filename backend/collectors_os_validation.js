const Agent = require("./models/Agent");
const Compliance = require("./models/Compliance");
const { createNotification } = require("./utils/notify");
const Asset = require("./models/Asset");

function detectFamily(rawOsName) {
  const lower = (rawOsName || "").toLowerCase();
  if (lower.includes("windows")) return "windows";
  if (lower.includes("linux") || lower.includes("kali") || lower.includes("debian") || lower.includes("ubuntu")) return "linux";
  return null; // not enough real data yet to judge
}

// A server-class OS reported by Wazuh, paired with a "workstation" role
// declared at registration, is an internal contradiction worth flagging —
// not a live data check, just two already-stored facts disagreeing.
function isServerClassOs(rawOsName) {
  return (rawOsName || "").toLowerCase().includes("server");
}

async function runOsValidation() {
  try {
    const agents = await Agent.find({}).lean();
    let flagged = 0;

    for (const agent of agents) {
      const rx = new RegExp(`^${agent.hostname}$`, "i");
      const comp = await Compliance.findOne({ assetHostname: rx }).sort({ collectedAt: -1 }).lean();
      const detectedName = comp?.raw?.agent?.os?.name || "";
      const detectedFamily = detectFamily(detectedName);

      // No real Wazuh data yet for this machine — nothing to validate against.
      if (!detectedFamily) continue;
    
      const isOsMismatch = detectedFamily !== agent.os;

      if (isOsMismatch && !agent.osMismatch) {
        createNotification({
          type: "os_mismatch",
          severity: "warning",
          title: "Registered OS does not match detected OS",
          message: `${agent.hostname} was registered as ${agent.os}, but Wazuh reports "${detectedName}". Please verify and correct the machine's registration.`,
          targetRoles: ["admin"],
        });
        flagged++;
      }

      // Role vs. detected OS: a server-class OS registered as a plain
      // workstation is an internal contradiction, not a live check.
      const isRoleMismatch = isServerClassOs(detectedName) && agent.role === "workstation";
      if (isRoleMismatch && !agent.roleMismatch) {
        createNotification({
          type: "role_mismatch",
          severity: "warning",
          title: "Machine role may be misconfigured",
          message: `${agent.hostname} is registered as a workstation, but Wazuh reports it is running "${detectedName}" — a server-class OS. Please verify its role.`,
          targetRoles: ["admin"],
        });
        flagged++;
      }

      // IP vs. what the machine's own patch collector last reported —
      // a real, live comparison, same pattern as the OS check.
      const assetRecord = await Asset.findOne({ hostname: rx }).lean();
      const detectedIp = assetRecord?.ip || "";
      const isIpMismatch = !!(agent.ip && detectedIp && agent.ip !== detectedIp);
      if (isIpMismatch && !agent.ipMismatch) {
        createNotification({
          type: "ip_mismatch",
          severity: "warning",
          title: "Registered IP does not match reported IP",
          message: `${agent.hostname} was registered with IP ${agent.ip}, but its collector last reported from ${detectedIp}. Please verify and correct the machine's registration.`,
          targetRoles: ["admin"],
        });
        flagged++;
      }

      await Agent.findByIdAndUpdate(agent._id, {
        detectedOs: detectedName,
        osMismatch: isOsMismatch,
        roleMismatch: isRoleMismatch,
        detectedIp,
        ipMismatch: isIpMismatch,
        osValidatedAt: new Date(),
      });

    }

    if (flagged > 0) {
      console.log(`[osValidation] flagged ${flagged} new OS mismatch(es)`);
    }
  } catch (e) {
    console.error("[osValidation] check failed:", e.message);
  }
}

module.exports = { runOsValidation };
