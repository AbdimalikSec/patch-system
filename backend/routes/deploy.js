const router     = require("express").Router();
const { NodeSSH } = require("node-ssh");
const http       = require("http");

// ── Asset configs ─────────────────────────────────────────────────────────────
const SSH_CONFIG = {
  kali: {
    host:           "10.10.10.63",
    port:           22,
    username:       "stager",
    privateKeyPath: "/home/patch/.ssh/patch_key",
  },
};

const WINRM_CONFIG = {
  dc1: {
    host:     "10.10.20.10",
    port:     5985,
    username: "Administrator",
    password: "15422035s$",
  },
  "hq-staff-01": {
    host:     "10.10.10.60",
    port:     5985,
    username: "hqSaacid",
    password: "passwordS$",
  },
};

// ── WinRM helper ──────────────────────────────────────────────────────────────
function runWinRM(config, command) {
  return new Promise((resolve, reject) => {
    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:wsman="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
            xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <s:Header>
    <wsa:To>http://${config.host}:${config.port}/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsman:ResourceURI s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</wsman:ResourceURI>
    <wsa:Action s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/09/transfer/Create</wsa:Action>
    <wsa:MessageID>uuid:1</wsa:MessageID>
    <wsman:OperationTimeout>PT120.000S</wsman:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:Shell><rsp:InputStreams>stdin</rsp:InputStreams><rsp:OutputStreams>stdout stderr</rsp:OutputStreams></rsp:Shell>
  </s:Body>
</s:Envelope>`;

    const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");

    const options = {
      hostname: config.host,
      port:     config.port,
      path:     "/wsman",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/soap+xml;charset=UTF-8",
        "Authorization":  `Basic ${auth}`,
        "Content-Length": Buffer.byteLength(soap),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, output: data, code: res.statusCode });
        } else {
          resolve({ success: false, output: data, code: res.statusCode });
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(130000, () => { req.destroy(); reject(new Error("WinRM timeout")); });
    req.write(soap);
    req.end();
  });
}

// Simpler WinRM using PowerShell via direct exec
function runPowerShell(config, psCommand) {
  return new Promise((resolve, reject) => {
    const encodedCmd = Buffer.from(psCommand, "utf16le").toString("base64");
    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:wsman="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
            xmlns:p="http://schemas.microsoft.com/wbem/wsman/1/wsman.xsd">
  <s:Header>
    <wsa:Action>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command</wsa:Action>
    <wsa:To>http://${config.host}:${config.port}/wsman</wsa:To>
    <wsman:ResourceURI>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</wsman:ResourceURI>
    <wsa:MessageID>uuid:2</wsa:MessageID>
    <wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsman:OperationTimeout>PT120S</wsman:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:CommandLine xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
      <rsp:Command>powershell.exe -NonInteractive -EncodedCommand ${encodedCmd}</rsp:Command>
    </rsp:CommandLine>
  </s:Body>
</s:Envelope>`;

    const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");

    const options = {
      hostname: config.host,
      port:     config.port,
      path:     "/wsman",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/soap+xml;charset=UTF-8",
        "Authorization":  `Basic ${auth}`,
        "Content-Length": Buffer.byteLength(soap),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ success: res.statusCode < 400, output: data, code: res.statusCode }));
    });

    req.on("error", reject);
    req.setTimeout(130000, () => { req.destroy(); reject(new Error("WinRM timeout")); });
    req.write(soap);
    req.end();
  });
}

// ── POST /api/deploy/patch ────────────────────────────────────────────────────
router.post("/patch", async (req, res) => {
  const { hostname, package: pkg } = req.body;

  if (!hostname || !pkg) {
    return res.status(400).json({ ok: false, error: "hostname and package required" });
  }

  const hostKey = hostname.toLowerCase();

  // ── Linux (kali) via SSH ──────────────────────────────────────────────────
  if (SSH_CONFIG[hostKey]) {
    const config = SSH_CONFIG[hostKey];
    const ssh    = new NodeSSH();
    try {
      await ssh.connect(config);

      // Extract just the package name without version/repo suffix
      const pkgName = pkg.split("/")[0].trim();

      const result = await ssh.execCommand(
        `echo 'password' | sudo -S DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y ${pkgName} 2>&1`,
        { timeout: 120000 }
      );

      // Trigger kali's patch collector to update MongoDB count
      try {
        await ssh.execCommand(
          "sudo systemctl restart riskpatch-linux-collector.service 2>/dev/null || true",
          { timeout: 15000 }
        );
      } catch {}

      ssh.dispose();

      const output  = (result.stdout + result.stderr).slice(0, 1000);
      const success = result.code === 0 || output.includes("already the newest") || output.includes("upgraded");

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
      ssh.dispose();
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Windows (DC1, HQ-staff-01) via WinRM ─────────────────────────────────
  if (WINRM_CONFIG[hostKey]) {
    const config = WINRM_CONFIG[hostKey];

    // KB number extraction — pkg will be something like "KB5075899"
    const kbMatch = pkg.match(/KB\d+/i);
    if (!kbMatch) {
      return res.status(400).json({
        ok: false,
        error: `Cannot extract KB number from "${pkg}". Windows patches require a KB number.`,
      });
    }
    const kb = kbMatch[0].toUpperCase();

    const psCommand = `
Import-Module PSWindowsUpdate -ErrorAction SilentlyContinue
$result = Get-WindowsUpdate -KBArticleID "${kb}" -ErrorAction SilentlyContinue
if ($result) {
  Install-WindowsUpdate -KBArticleID "${kb}" -AcceptAll -IgnoreReboot -ErrorAction SilentlyContinue
  Write-Output "Installed ${kb}"
} else {
  Write-Output "${kb} not found in pending updates or already installed"
}
`;

    try {
      const result = await runPowerShell(config, psCommand);
      return res.json({
        ok: result.success,
        hostname,
        package: kb,
        output: result.output.slice(0, 500),
        message: result.success
          ? `${kb} install command sent to ${hostname}`
          : `WinRM responded with status ${result.code}`,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: `WinRM error: ${e.message}` });
    }
  }

  return res.status(400).json({ ok: false, error: `No patch config found for ${hostname}` });
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
      return res.json({ ok: true, reachable: false, method: "ssh", reason: e.message });
    }
  }

  if (WINRM_CONFIG[hostKey]) {
    try {
      const result = await runWinRM(WINRM_CONFIG[hostKey], "whoami");
      return res.json({ ok: true, reachable: result.code < 500, method: "winrm", code: result.code });
    } catch (e) {
      return res.json({ ok: true, reachable: false, method: "winrm", reason: e.message });
    }
  }

  return res.json({ ok: true, reachable: false, reason: "No config for this host" });
});

module.exports = router;