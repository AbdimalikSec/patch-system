const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const Agent = require("../models/Agent");
const AssetMeta = require("../models/AssetMeta");
const Asset = require("../models/Asset");
const Patch = require("../models/Patch");
const ComplianceCheck = require("../models/ComplianceCheck");
const axios = require("axios");
const https = require("https");
const { SUPPORTED_OS } = require("../config/osTypes");


// ── GET /api/machines — list all machines (admin) ─────────────────────────────
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const agents = await Agent.find({ archived: { $ne: true } }).sort({ createdAt: -1 }).lean();
    const safe = agents.map(({ password, ...rest }) => ({
      ...rest,
      hasPassword: !!password,
    }));
    res.json({ ok: true, count: safe.length, data: safe });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ── POST /api/machines — add a new machine (admin) ────────────────────────────
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
      const {
      hostname,
      os,
      ip,
      deployMethod,
      username,
      password,
      sshKeyPath,
      sshPort,
      criticality,
      role,
      exposureLevel,
      wazuhId,
      networkCategory,
    } = req.body;

    if (!hostname) return res.status(400).json({ ok: false, error: "hostname required" });
    if (deployMethod && !["agent", "ssh"].includes(deployMethod))
      return res.status(400).json({ ok: false, error: "deployMethod must be agent or ssh" });
   if (!os || !SUPPORTED_OS.includes(os))    
      return res.status(400).json({ ok: false, error: "os must be windows or linux" });
    if (networkCategory && !["domain", "physical", "security"].includes(networkCategory))
      return res.status(400).json({ ok: false, error: "networkCategory must be domain, physical, or security" });


       const existing = await Agent.findOne({ hostname });
    if (existing && !existing.archived)
      return res.status(409).json({ ok: false, error: `Machine "${hostname}" already exists` });

    if (existing && existing.archived) {
      // Reviving a previously-deleted machine, rather than blocking
      // re-registration or creating a second, duplicate record.
      const revived = await Agent.findByIdAndUpdate(
        existing._id,
        {
          os, ip, deployMethod, username, password, sshKeyPath, sshPort,
          criticality, role, exposureLevel, networkCategory,
          archived: false, archivedAt: null, enrolled: false, wazuhId: "",
        },
        { new: true },
      );
      return res.json({ ok: true, data: revived, revived: true });
    }

      const agentDoc = {
      hostname,
      os,
      ip: ip || "",
      deployMethod: deployMethod || (os === "linux" ? "ssh" : "agent"),
      username: username || "",
      password: password || "",
      sshKeyPath: sshKeyPath || "",
      sshPort: sshPort || 22,
      criticality: criticality !== undefined ? criticality : 0.5,
      role: role || "workstation",
      exposureLevel: exposureLevel || "internal",
      wazuhId: wazuhId || "",
      networkCategory: networkCategory || "physical",
      enrolled: false,
      addedVia: "dashboard",
    };

    const agent = await Agent.create(agentDoc);

    await AssetMeta.findOneAndUpdate(
      { hostname },
      {
        hostname,
        criticality: agentDoc.criticality,
        role: agentDoc.role,
        exposureLevel: agentDoc.exposureLevel,
        internet_facing: agentDoc.exposureLevel === "internet",
      },
      { upsert: true, returnDocument: "after" }
    );

    res.json({ ok: true, data: { id: agent._id, hostname: agent.hostname } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DELETE /api/machines/:hostname — full removal (admin) ─────────────────────
router.delete("/:hostname", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { hostname } = req.params;

    // Look up the machine first (need its wazuhId to deregister from Wazuh)
    const agent = await Agent.findOne({ hostname }).lean();
    if (!agent)
      return res.status(404).json({ ok: false, error: "Machine not found" });

    const summary = { hostname };

    // 1. Deregister from Wazuh (best-effort — don't block local cleanup if it fails)
    if (agent.wazuhId) {
      try {
        const wazuhClient = axios.create({
          baseURL: process.env.WAZUH_API_URL,
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 15000,
        });
        const basic = Buffer.from(
          `${process.env.WAZUH_API_USER}:${process.env.WAZUH_API_PASS}`
        ).toString("base64");
        const tokenRes = await wazuhClient.post(
          "/security/user/authenticate",
          null,
          { headers: { Authorization: `Basic ${basic}` } }
        );
        const token = tokenRes.data?.data?.token;
        if (token) {
          await wazuhClient.delete(
            `/agents?agents_list=${agent.wazuhId}&status=all&older_than=0s`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          summary.wazuhDeregistered = true;
        }
      } catch (e) {
        summary.wazuhDeregistered = false;
        summary.wazuhError = e.message;
      }
    }

      // 2. Archive the Agent record (not deleted) so it can be found and
    // revived later if this same machine is re-registered or its Wazuh
    // agent reconnects. Current-state records (Asset/Patch/Compliance) are
    // cleared since they'd just be stale snapshots; historical records
    // (Tickets, RiskSnapshots, ComplianceHistory) are deliberately left
    // untouched.
    await Agent.updateOne({ hostname }, { archived: true, archivedAt: new Date(), enrolled: false, wazuhId: "" });
    summary.agentArchived = true;
    summary.assetMetaRemoved = (await AssetMeta.deleteMany({ hostname })).deletedCount;
    summary.assetRemoved = (await Asset.deleteMany({ hostname })).deletedCount;
    summary.patchesRemoved = (await Patch.deleteMany({ assetHostname: hostname })).deletedCount;
    summary.complianceRemoved = (await ComplianceCheck.deleteMany({ assetHostname: hostname })).deletedCount;

    res.json({
      ok: true,
      message: `${hostname} fully removed`,
      summary,
    });
  } catch (e) {
    console.error("Delete machine error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/machines/:hostname/enroll-script — generate install script ────────
router.get("/:hostname/enroll-script", requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = await Agent.findOne({ hostname: req.params.hostname }).lean();
    if (!agent) return res.status(404).json({ ok: false, error: "Machine not found" });

    // These come from the server environment / known fixed IPs
    const PATCH_SRV = process.env.PATCH_SRV_IP || "192.168.0.30";
    const WAZUH_IP = process.env.WAZUH_IP || "192.168.0.20";
    const AGENT_SECRET = "riskpatch-agent-2026";

    let script = "";

    if (agent.os === "windows") {
      script = `# RiskPatch enrollment script for ${agent.hostname}
# Run this ONCE on the new machine in PowerShell as Administrator.

# 1. Install Wazuh agent
Invoke-WebRequest -Uri "https://packages.wazuh.com/4.x/windows/wazuh-agent-4.7.0-1.msi" -OutFile "C:\\wazuh-agent.msi"
msiexec.exe /i C:\\wazuh-agent.msi /q WAZUH_MANAGER="${WAZUH_IP}" WAZUH_AGENT_NAME="${agent.hostname}"
Start-Sleep -Seconds 20
Start-Service WazuhSvc

# 2. Install PSWindowsUpdate
Install-Module PSWindowsUpdate -Force -Scope AllUsers

# 3. Create collector
New-Item -ItemType Directory -Force -Path "C:\\RiskPatch\\collectors"
@'
\$API = "http://${PATCH_SRV}:5000"
\$HOSTNAME = \$env:COMPUTERNAME
\$IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.IPAddress -like "192.168.0.*" } | Select-Object -First 1 -ExpandProperty IPAddress)
if (-not \$IP) { \$IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.IPAddress -notlike "127.*" -and \$_.IPAddress -notlike "169.*" } | Select-Object -First 1 -ExpandProperty IPAddress) }
function Post-Json(\$url, \$obj) { \$json = \$obj | ConvertTo-Json -Depth 6; Invoke-RestMethod -Method Post -Uri \$url -ContentType "application/json" -Body \$json }
\$LOG = "C:\\RiskPatch\\collectors\\collector.log"
function Log(\$m) { "\$(Get-Date -Format o) \$m" | Out-File -FilePath \$LOG -Append -Encoding UTF8 }
Log "Collector run started"
# Post asset FIRST so the machine checks in instantly, before the slow update query
\$assetBody = @{ hostname = \$HOSTNAME; os = "windows"; ip = \$IP; source = "collector-win"; raw = @{ collectedAt = (Get-Date).ToString("o") } }
try { Post-Json "\$API/api/ingest/asset" \$assetBody | Out-Null; Log "Asset posted (\$HOSTNAME / \$IP)" } catch { Log "Asset post failed: \$(\$_.Exception.Message)" }
# Then the slow part: query Windows Update
Import-Module PSWindowsUpdate -ErrorAction SilentlyContinue
\$missingUpdates = @(); \$missingKBs = @()
try { \$updates = Get-WindowsUpdate -AcceptAll -IgnoreReboot 2>\$null; foreach (\$u in \$updates) { \$kb = \$u.KB; if (-not \$kb) { \$kb = "" }; \$missingUpdates += @{ title = \$u.Title; kb = \$kb }; if (\$kb) { \$missingKBs += \$kb } }; Log "Update query done: \$(\$missingUpdates.Count) missing" } catch { Log "Update query failed: \$(\$_.Exception.Message)" }
\$patchBody = @{ assetHostname = \$HOSTNAME; os = "windows"; missingCount = \$missingUpdates.Count; missing = \$missingKBs; raw = @{ collectedAt = (Get-Date).ToString("o"); ip = \$IP; missingDetails = \$missingUpdates } }
try { Post-Json "\$API/api/ingest/patch" \$patchBody | Out-Null; Log "Patch posted" } catch { Log "Patch post failed: \$(\$_.Exception.Message)" }
Log "Collector run finished"
'@ | Set-Content C:\\RiskPatch\\collectors\\win_patch_collector.ps1

# 4. Create RiskPatch agent
New-Item -ItemType Directory -Force -Path "C:\\RiskPatch\\agent"
@'
\$PATCH_SRV = "http://${PATCH_SRV}:5000"
\$HOSTNAME = \$env:COMPUTERNAME
\$SECRET = "${AGENT_SECRET}"
\$LOG = "C:\\RiskPatch\\agent\\agent.log"
function Write-Log(\$msg) { \$ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"); "\$ts \$msg" | Out-File -FilePath \$LOG -Append -Encoding UTF8 }
function Poll-Commands { try { \$resp = Invoke-RestMethod -Uri "\$PATCH_SRV/api/agent/commands/\$HOSTNAME" -Method GET -Headers @{ "x-agent-secret" = \$SECRET } -TimeoutSec 10; return \$resp.commands } catch { return @() } }
function Install-KB(\$kb) { try { Import-Module PSWindowsUpdate -ErrorAction Stop; \$result = Install-WindowsUpdate -KBArticleID \$kb -AcceptAll -IgnoreReboot -Confirm:\$false -ErrorAction Stop; if (\$result) { \$rc = \$result[0].Result; if (\$rc -like "Installed*") { return @{ success = \$true; output = "Install result: \$rc" } } else { return @{ success = \$false; output = "Install result: \$rc" } } } else { return @{ success = \$false; output = "No result returned from Install-WindowsUpdate" } } } catch { return @{ success = \$false; output = \$_.Exception.Message } } }
function Report-Result(\$id, \$status, \$output) { try { \$body = @{ commandId = \$id; status = \$status; output = \$output } | ConvertTo-Json; Invoke-RestMethod -Uri "\$PATCH_SRV/api/agent/report" -Method POST -ContentType "application/json" -Headers @{ "x-agent-secret" = \$SECRET } -Body \$body -TimeoutSec 10 | Out-Null } catch {} }
Write-Log "RiskPatch Agent started on \$HOSTNAME"
while ($true) { $commands = Poll-Commands; foreach ($cmd in $commands) { $cmdType = if ($cmd.type) { $cmd.type } else { "patch" }; if ($cmdType -eq "restart" -or $cmd.kb -eq "RESTART") { Report-Result $cmd._id "success" "Restart scheduled"; Start-Sleep -Seconds 2; shutdown /r /t 60 /c "RiskPatch restart" } else { Report-Result $cmd._id "running" "Download and install starting now..."; $result = Install-KB $cmd.kb; $status = if ($result.success) { "success" } else { "failed" }; Report-Result $cmd._id $status $result.output } }; Start-Sleep -Seconds 30 }
'@ | Set-Content C:\\RiskPatch\\agent\\RiskPatch-Agent.ps1

# 4.5 Disable native Windows Update auto-install, so RiskPatch becomes the
# sole authority over when this machine actually gets patched -- otherwise
# Windows could quietly download, install, and reboot entirely on its own
# schedule, invisible to and uncoordinated with the tool meant to manage it.
# This does NOT fully disable Windows Update -- a human can still manually
# check in Settings; it only removes automatic, unattended installation.
\$auPath = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU"
if (!(Test-Path \$auPath)) { New-Item -Path \$auPath -Force | Out-Null }
Set-ItemProperty -Path \$auPath -Name "NoAutoUpdate" -Value 0 -Type DWord
Set-ItemProperty -Path \$auPath -Name "AUOptions" -Value 2 -Type DWord

# 5. Register scheduled tasks
\$collAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File C:\\RiskPatch\\collectors\\win_patch_collector.ps1"
\$collTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date)
\$collTrigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition
\$collSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
\$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "RiskPatch-${agent.hostname}-Collector" -Action \$collAction -Trigger \$collTrigger -Settings \$collSettings -Principal \$principal -Force
Start-ScheduledTask -TaskName "RiskPatch-${agent.hostname}-Collector"

\$agentAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File C:\\RiskPatch\\agent\\RiskPatch-Agent.ps1"
\$agentTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date)
\$agentTrigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition
\$agentSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "RiskPatchAgent" -Action \$agentAction -Trigger \$agentTrigger -Settings \$agentSettings -Principal \$principal -Force
Start-ScheduledTask -TaskName "RiskPatchAgent"

Write-Host "RiskPatch enrollment complete for ${agent.hostname}"
`;
    } else {
      script = `#!/bin/bash
# RiskPatch enrollment script for ${agent.hostname} (Linux)
# Run this ONCE on the new machine with: sudo bash enroll.sh

# 1. Install Wazuh agent
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import
chmod 644 /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | tee /etc/apt/sources.list.d/wazuh.list
apt-get update
WAZUH_MANAGER="${WAZUH_IP}" apt-get install -y wazuh-agent
systemctl daemon-reload
systemctl enable wazuh-agent
systemctl start wazuh-agent

# 2. Create collector
mkdir -p /opt/riskpatch/collectors
cat > /opt/riskpatch/collectors/linux_patch_collector.sh << 'COLLECTOR'
#!/usr/bin/env bash
set -euo pipefail
API="http://${PATCH_SRV}:5000"
HOSTNAME="\$(hostname)"
IP="\$(ip -4 addr show | awk '/inet 192\\.168\\./ {print \$2}' | cut -d/ -f1 | head -n1)"
UPGRADABLE="\$(apt-get -s upgrade 2>/dev/null | grep '^Inst' | awk '{print \$2}' || true)"
MISSING_COUNT="\$(echo "\$UPGRADABLE" | sed '/^\\s*\$/d' | wc -l | tr -d ' ')"
MISSING_JSON="\$(echo "\$UPGRADABLE" | sed '/^\\s*\$/d' | jq -R -s -c 'split("\\n")[:-1]')"
ASSET_JSON=\$(jq -n --arg h "\$HOSTNAME" --arg ip "\$IP" '{hostname:\$h,os:"linux",ip:\$ip,source:"collector-linux",raw:{collectedAt:(now|todateiso8601)}}')
PATCH_JSON=\$(jq -n --arg h "\$HOSTNAME" --argjson c "\$MISSING_COUNT" --argjson m "\$MISSING_JSON" --arg ip "\$IP" '{assetHostname:\$h,os:"linux",missingCount:\$c,missing:\$m,raw:{collectedAt:(now|todateiso8601),ip:\$ip}}')
curl -s -X POST "\$API/api/ingest/asset" -H "Content-Type: application/json" -d "\$ASSET_JSON" >/dev/null
curl -s -X POST "\$API/api/ingest/patch" -H "Content-Type: application/json" -d "\$PATCH_JSON" >/dev/null
COLLECTOR
chmod +x /opt/riskpatch/collectors/linux_patch_collector.sh

# 3. systemd timer
cat > /etc/systemd/system/riskpatch-linux-collector.service << 'SVC'
[Unit]
Description=RiskPatch Linux Patch Collector
[Service]
Type=oneshot
ExecStart=/opt/riskpatch/collectors/linux_patch_collector.sh
SVC
cat > /etc/systemd/system/riskpatch-linux-collector.timer << 'TMR'
[Unit]
Description=Run RiskPatch Linux Collector every 10 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
Persistent=true
[Install]
WantedBy=timers.target
TMR
systemctl daemon-reload
systemctl enable riskpatch-linux-collector.timer
systemctl start riskpatch-linux-collector.timer
/opt/riskpatch/collectors/linux_patch_collector.sh

echo "RiskPatch enrollment complete for ${agent.hostname}"
`;
    }

    res.json({ ok: true, hostname: agent.hostname, os: agent.os, script });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
