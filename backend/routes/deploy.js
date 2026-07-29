const router = require("express").Router();
const { NodeSSH } = require("node-ssh");
const Agent = require("../models/Agent");
const { requireRole } = require("../middleware/authMiddleware");

// ── Asset configs ─────────────────────────────────────────────────────────────
let SSH_CONFIG = {
  kali: {
    host: "192.168.0.62",
    port: 22,
    username: "stager",
    privateKeyPath: "/home/patch/.ssh/patch_key",
  },
};

// Refresh configs from the database so DB-added machines work without code edits
async function refreshConfigsFromDB() {
  try {
    const agents = await Agent.find({}).lean();
    for (const a of agents) {
      const key = a.hostname.toLowerCase();
      if (a.os === "linux" && a.deployMethod === "ssh") {
        SSH_CONFIG[key] = {
          host: a.ip,
          port: a.sshPort || 22,
          username: a.username,
          privateKeyPath: a.sshKeyPath,
        };
      }
    }
  } catch (e) {
    console.error("[deploy] Could not refresh configs from DB:", e.message);
  }
}

// ── POST /api/deploy/patch ────────────────────────────────────────────────────
router.post("/patch", requireRole("admin", "patch-operator"), async (req, res) => {
  const { hostname, package: pkg } = req.body;

  if (!hostname || !pkg) {
    return res
      .status(400)
      .json({ ok: false, error: "hostname and package required" });
  }
  await refreshConfigsFromDB();
  const hostKey = hostname.toLowerCase();

  // ── Linux (kali) via SSH ──────────────────────────────────────────────────
  if (SSH_CONFIG[hostKey]) {
    const config = SSH_CONFIG[hostKey];
    const ssh = new NodeSSH();

    try {
      await ssh.connect(config);

      const pkgName = pkg.split("/")[0].trim();

      const lockCheck = await ssh.execCommand(
        `sudo lsof /var/lib/dpkg/lock-frontend 2>/dev/null | grep -c lock-frontend || echo 0`,
        { timeout: 5000 },
      );
      const isLocked = parseInt((lockCheck.stdout || "").trim()) > 0;
      if (isLocked) {
        ssh.dispose();
        return res.json({
          ok: false,
          hostname,
          package: pkgName,
          output:
            "Another package installation is in progress. Wait for it to complete then try again.",
          message: "apt locked",
        });
      }

      const AgentCommand = require("../models/AgentCommand");
      const cmd = await AgentCommand.create({
        hostname,
        kb: pkgName,
        status: "running",
        triggeredBy: req.user?.username || "unknown",
        triggeredById: req.user?._id,
      });

      const result = await ssh.execCommand(
        `echo 'password' | sudo -S DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=60 install --only-upgrade -y ${pkgName} 2>&1`,
        { timeout: 300000 },
      );

      try {
        await ssh.execCommand(
          "sudo systemctl restart riskpatch-linux-collector.service 2>/dev/null || true",
          { timeout: 15000 },
        );
      } catch {}

      ssh.dispose();

      const output = (result.stdout + result.stderr).slice(0, 1000);
      const success =
        result.code === 0 ||
        output.includes("already the newest") ||
        output.includes("upgraded");

      await AgentCommand.findByIdAndUpdate(cmd._id, {
        status: success ? "success" : "failed",
        output: output.slice(0, 500),
        completedAt: new Date(),
      });

      return res.json({
        ok: success,
        hostname,
        package: pkgName,
        commandId: cmd._id.toString(),
        output,
        message: success
          ? `${pkgName} patched on ${hostname}`
          : `Patch may have failed — check output`,
      });
    } catch (e) {
      try {
        ssh.dispose();
      } catch {}
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Windows via agent polling (works for ANY registered Windows machine) ────
  const agentDoc = await Agent.findOne({
    hostname: { $regex: new RegExp(`^${hostname}$`, "i") },
  }).lean();

  if (agentDoc && agentDoc.os === "windows") {
    const kbMatch = pkg.match(/KB\d+/i);
    if (!kbMatch) {
      return res.status(400).json({
        ok: false,
        error: `Cannot extract KB number from "${pkg}". Windows patches require a KB number like KB5075899.`,
      });
    }
    const kb = kbMatch[0].toUpperCase();

    const AgentCommand = require("../models/AgentCommand");
    const cmd = await AgentCommand.create({
      hostname,
      kb,
      triggeredBy: req.user?.username || "unknown",
      triggeredById: req.user?._id,
    });

    return res.json({
      ok: true,
      hostname,
      package: kb,
      commandId: cmd._id.toString(),
      output: `Agent on ${hostname} will install ${kb} within 60 seconds`,
      message: `${kb} queued for ${hostname}`,
    });
  }

  return res
    .status(400)
    .json({ ok: false, error: `No patch config found for ${hostname}` });
});

// ── GET /api/deploy/status/:hostname ─────────────────────────────────────────
router.get("/status/:hostname", requireRole("admin", "compliance-officer", "patch-operator", "analyst"), async (req, res) => {
  await refreshConfigsFromDB();
  const hostKey = req.params.hostname.toLowerCase();

  if (SSH_CONFIG[hostKey]) {
    const ssh = new NodeSSH();
    try {
      await ssh.connect({ ...SSH_CONFIG[hostKey], readyTimeout: 5000 });
      ssh.dispose();
      return res.json({ ok: true, reachable: true, method: "ssh" });
    } catch (e) {
      return res.json({
        ok: true,
        reachable: false,
        method: "ssh",
        reason: e.message,
      });
    }
  }

  return res.json({
    ok: true,
    reachable: false,
    reason: "No config for this host",
  });
});

// ── POST /api/deploy/restart ─────────────────────────────────────────────────
router.post("/restart", requireRole("admin", "patch-operator"), async (req, res) => {
  try {
    const { hostname } = req.body;
    if (!hostname) return res.status(400).json({ ok: false, error: "hostname required" });

    const agentDoc = await Agent.findOne({ hostname }).lean();
    const blockedRoles = ["domain controller", "server"];
    if (agentDoc && blockedRoles.includes((agentDoc.role || "").toLowerCase())) {
      return res.status(403).json({
        ok: false,
        error: `Restart not allowed on ${hostname} (role: ${agentDoc.role}). Schedule manually during a maintenance window.`,
      });
    }

    const AgentCommand = require("../models/AgentCommand");
    const cmd = await AgentCommand.create({
      hostname,
      kb: "RESTART",
      type: "restart",
      triggeredBy: req.user?.username || "unknown",
      triggeredById: req.user?._id,
    });

    return res.json({
      ok: true,
      hostname,
      commandId: cmd._id.toString(),
      message: `Restart command queued for ${hostname}. Machine will restart in 60 seconds.`,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/deploy/apt-update ───────────────────────────────────────────────
router.post("/apt-update", requireRole("admin", "patch-operator"), async (req, res) => {
  const { hostname } = req.body;
  if (!hostname) return res.status(400).json({ ok: false, error: "hostname required" });
  await refreshConfigsFromDB();
  const hostKey = hostname.toLowerCase();
  if (!SSH_CONFIG[hostKey]) {
    return res.status(400).json({ ok: false, error: `No SSH config for ${hostname}` });
  }

  const ssh = new NodeSSH();
  try {
    await ssh.connect(SSH_CONFIG[hostKey]);
    const result = await ssh.execCommand(
      `echo 'password' | sudo -S apt-get update 2>&1`,
      { timeout: 120000 }
    );
    ssh.dispose();
    const success = result.code === 0 || (result.stdout || "").includes("Reading package lists");
    return res.json({
      ok: success,
      hostname,
      output: (result.stdout + result.stderr).slice(0, 500),
      message: success ? "Package index refreshed successfully" : "apt-get update may have failed",
    });
  } catch (e) {
    try { ssh.dispose(); } catch {}
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
