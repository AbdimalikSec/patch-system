const router   = require("express").Router();
const { NodeSSH } = require("node-ssh");

// SSH config for each Linux asset
const SSH_CONFIG = {
  kali: {
    host:       "10.10.10.63",
    port:       22,
    username:   "stager",
    privateKeyPath: "/home/patch/.ssh/patch_key",
  },
};

// POST /api/deploy/patch
// Body: { hostname, package }
router.post("/patch", async (req, res) => {
  const { hostname, package: pkg } = req.body;

  if (!hostname || !pkg) {
    return res.status(400).json({ ok: false, error: "hostname and package required" });
  }

  const config = SSH_CONFIG[hostname.toLowerCase()];
  if (!config) {
    return res.status(400).json({ ok: false, error: `No SSH config for ${hostname}. Windows patching not yet supported.` });
  }

  const ssh = new NodeSSH();

  try {
    await ssh.connect(config);

    // Run apt-get upgrade for the specific package
    const result = await ssh.execCommand(
      `echo 'password' | sudo -S apt-get install --only-upgrade -y ${pkg} 2>&1`,
      { timeout: 120000 }
    );

    ssh.dispose();

    const output = result.stdout + result.stderr;
    const success = !result.code || result.code === 0;

    // Trigger the patch collector to update MongoDB
    try {
      const { execSync } = require("child_process");
      execSync(
        "node /opt/risk-patch-system/patch-system/backend/collectors_wazuh_indexer_sca.js",
        { timeout: 30000, cwd: "/opt/risk-patch-system/patch-system/backend" }
      );
    } catch {}

    res.json({
      ok: success,
      hostname,
      package: pkg,
      output: output.slice(0, 1000), // truncate long output
      message: success
        ? `Package ${pkg} upgraded successfully on ${hostname}`
        : `Upgrade may have failed — check output`,
    });

  } catch (e) {
    ssh.dispose();
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/deploy/status/:hostname — check if SSH is reachable
router.get("/status/:hostname", async (req, res) => {
  const config = SSH_CONFIG[req.params.hostname.toLowerCase()];
  if (!config) {
    return res.json({ ok: true, reachable: false, reason: "No SSH config for this host" });
  }

  const ssh = new NodeSSH();
  try {
    await ssh.connect({ ...config, readyTimeout: 5000 });
    ssh.dispose();
    res.json({ ok: true, reachable: true });
  } catch (e) {
    res.json({ ok: true, reachable: false, reason: e.message });
  }
});

module.exports = router;