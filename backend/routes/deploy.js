const router = require("express").Router();
const { NodeSSH } = require("node-ssh");
const { execSync } = require("child_process");

// ── Asset configs ─────────────────────────────────────────────────────────────
const SSH_CONFIG = {
  kali: {
    host: "10.10.10.62",
    port: 22,
    username: "stager",
    privateKeyPath: "/home/patch/.ssh/patch_key",
  },
};

const WINRM_CONFIG = {
  dc1: {
    host: "10.10.20.10",
    username: "Administrator",
    password: "15422035s$",
  },
  "hq-staff-01": {
    host: "10.10.10.60",
    username: "hqSaacid",
    password: "passwordS$",
  },
};

// ── Run PowerShell via pywinrm ────────────────────────────────────────────────
function runPowerShell(config, psCommand) {
  // Escape single quotes in the PS command for Python string
  const escaped = psCommand
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");

  const pythonScript = `
import winrm, sys
try:
    s = winrm.Session('${config.host}', auth=('${config.username}', '${config.password}'), transport='basic')
    r = s.run_ps('${escaped}')
    print(r.std_out.decode('utf-8', errors='replace'))
    if r.std_err:
        print('STDERR:', r.std_err.decode('utf-8', errors='replace'), file=sys.stderr)
    sys.exit(r.status_code)
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
`;

  try {
    const output = execSync(
      `python3 -c "${pythonScript.replace(/"/g, '\\"')}"`,
      {
        timeout: 600000,
        encoding: "utf8",
      },
    );
    return { success: true, output };
  } catch (e) {
    return {
      success: false,
      output: (e.stdout || "") + (e.stderr || "") || e.message,
    };
  }
}

// ── Better approach: write to temp file ──────────────────────────────────────
function runPowerShellViaTempFile(config, psCommand) {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  const scriptFile = path.join(os.tmpdir(), `winrm_${Date.now()}.py`);

  const pythonScript = `import winrm, sys
config_host = ${JSON.stringify(config.host)}
config_user = ${JSON.stringify(config.username)}
config_pass = ${JSON.stringify(config.password)}
ps_command  = ${JSON.stringify(psCommand)}
try:
    s = winrm.Session(config_host, auth=(config_user, config_pass), transport='basic')
    r = s.run_ps(ps_command)
    out = r.std_out.decode('utf-8', errors='replace')
    err = r.std_err.decode('utf-8', errors='replace')
    print(out)
    if err and err.strip():
        print('STDERR:', err)
    sys.exit(r.status_code)
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
`;

  fs.writeFileSync(scriptFile, pythonScript);
  try {
    const { spawnSync } = require("child_process");
    const result = spawnSync("python3", [scriptFile], {
      timeout: 600000,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    fs.unlinkSync(scriptFile);
    const out = (result.stdout || "").trim();
    const err = (result.stderr || "").trim();
    // CLIXML progress noise in stderr is normal for WinRM — not a real error
    const realError =
      err && !err.includes("CLIXML") && !err.includes("progress");
    const success = result.status === 0 || (out.length > 0 && !realError);
    return { success, output: out || err };
  } catch (e) {
    try {
      fs.unlinkSync(scriptFile);
    } catch {}
    return {
      success: false,
      output: (e.stdout || "") + (e.stderr || "") || e.message,
    };
  }
}

// ── POST /api/deploy/patch ────────────────────────────────────────────────────
router.post("/patch", async (req, res) => {
  const { hostname, package: pkg } = req.body;

  if (!hostname || !pkg) {
    return res
      .status(400)
      .json({ ok: false, error: "hostname and package required" });
  }

  const hostKey = hostname.toLowerCase();

  // ── Linux (kali) via SSH ──────────────────────────────────────────────────
  if (SSH_CONFIG[hostKey]) {
    const config = SSH_CONFIG[hostKey];
    const ssh = new NodeSSH();

    try {
      await ssh.connect(config);

      const pkgName = pkg.split("/")[0].trim();

      // Check if apt is already running
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

      const result = await ssh.execCommand(
        `echo 'password' | sudo -S DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=60 install --only-upgrade -y ${pkgName} 2>&1`,
        { timeout: 300000  },
      );

      // Trigger kali collector to update count
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

      return res.json({
        ok: success,
        hostname,
        package: pkgName,
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

  // ── Windows (DC1, HQ-staff-01) via pywinrm ───────────────────────────────
  if (WINRM_CONFIG[hostKey]) {
    const config = WINRM_CONFIG[hostKey];

    const kbMatch = pkg.match(/KB\d+/i);
    if (!kbMatch) {
      return res.status(400).json({
        ok: false,
        error: `Cannot extract KB number from "${pkg}". Windows patches require a KB number like KB5075899.`,
      });
    }
    const kb = kbMatch[0].toUpperCase();

    const AgentCommand = require("../models/AgentCommand");
    const cmd = await AgentCommand.create({ hostname, kb });

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
router.get("/status/:hostname", async (req, res) => {
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

  if (WINRM_CONFIG[hostKey]) {
    const config = WINRM_CONFIG[hostKey];
    const result = runPowerShellViaTempFile(config, "Write-Output ping");
    return res.json({
      ok: true,
      reachable: result.success,
      method: "winrm",
      reason: result.success ? null : result.output,
    });
  }

  return res.json({
    ok: true,
    reachable: false,
    reason: "No config for this host",
  });
});

module.exports = router;
