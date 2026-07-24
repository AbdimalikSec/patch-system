const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const { exec } = require("child_process");
const os = require("os");
const DiscoveredDevice = require("../models/DiscoveredDevice");
const Agent = require("../models/Agent");

// ── Auto-detect the subnet patch-srv is currently on ─────────────────────────
function ipToCidr(ip, netmask) {
  const ipParts = ip.split(".").map(Number);
  const maskParts = netmask.split(".").map(Number);
  const netParts = ipParts.map((p, i) => p & maskParts[i]);
  const prefixLength = maskParts.reduce(
    (acc, octet) => acc + octet.toString(2).split("1").length - 1,
    0
  );
  return `${netParts.join(".")}/${prefixLength}`;
}

function detectLocalSubnet() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        try {
          return ipToCidr(iface.address, iface.netmask);
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

function getSubnet() {
  return (
    process.env.NETWORK_SUBNET || detectLocalSubnet() || "192.168.0.0/24"
  );
}

// ── Run nmap ping sweep, return raw stdout ────────────────────────────────────
function runNmap(subnet) {
  return new Promise((resolve, reject) => {
    exec(
      `sudo nmap -sn ${subnet}`,
      { timeout: 120000, maxBuffer: 1024 * 1024 * 5 },
      (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error(stderr || err.message));
        resolve(stdout);
      }
    );
  });
}

// ── Parse nmap's plain-text -sn output into device records ──────────────────
function parseNmapOutput(output) {
  const devices = [];
  const blocks = output.split(/\n(?=Nmap scan report for )/);

  for (const block of blocks) {
    const headerMatch = block.match(/^Nmap scan report for (.+)$/m);
    if (!headerMatch) continue;

    const raw = headerMatch[1].trim();
    let ip = raw;
    let hostname = "";

    const parenMatch = raw.match(/^(.+?)\s+\(([\d.]+)\)$/);
    if (parenMatch) {
      hostname = parenMatch[1];
      ip = parenMatch[2];
    }

    const macMatch = block.match(/MAC Address:\s+([0-9A-Fa-f:]{17})\s*(?:\((.+?)\))?/);
    const mac = macMatch ? macMatch[1] : "";
    const vendor = macMatch && macMatch[2] ? macMatch[2] : "";

    devices.push({ ip, hostname, mac, vendor });
  }

  return devices;
}

// ── POST /api/discovery/scan — run a fresh sweep and upsert results ─────────
router.post("/scan", requireAuth, requireAdmin, async (req, res) => {
  try {
    const subnet = getSubnet();
    const output = await runNmap(subnet);
    const devices = parseNmapOutput(output);

    let created = 0;
    let updated = 0;

    for (const d of devices) {
      const existing = await DiscoveredDevice.findOne({ ip: d.ip });
      if (existing) {
        await DiscoveredDevice.updateOne(
          { ip: d.ip },
          {
            subnet,
            mac: d.mac || existing.mac,
            vendor: d.vendor || existing.vendor,
            hostname: d.hostname || existing.hostname,
            lastSeen: new Date(),
          }
        );
        updated++;
      } else {
        await DiscoveredDevice.create({
          ...d,
          subnet,
          firstSeen: new Date(),
          lastSeen: new Date(),
        });
        created++;
      }
    }

    res.json({ ok: true, subnet, found: devices.length, created, updated });
  } catch (e) {
    console.error("[discovery/scan]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/discovery — list devices, defaults to CURRENT subnet only ──────
// Pass ?all=true to see every device ever recorded, across all past networks.
router.get("/", requireAuth, async (req, res) => {
  try {
    const showAll = req.query.all === "true";
    const currentSubnet = getSubnet();

    const filter = showAll ? {} : { subnet: currentSubnet };
    const devices = await DiscoveredDevice.find(filter).sort({ ip: 1 }).lean();

    const agents = await Agent.find({}).lean();
    const agentByIP = new Map(agents.map((a) => [a.ip, a]));

    const data = devices.map((d) => {
      const match = agentByIP.get(d.ip);
      return {
        ...d,
        known: !!match,
        matchedHostname: match ? match.hostname : null,
      };
    });

    res.json({
      ok: true,
      subnet: currentSubnet,
      showingAll: showAll,
      total: data.length,
      known: data.filter((d) => d.known).length,
      unknown: data.filter((d) => !d.known).length,
      data,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DELETE /api/discovery/clear — wipe all discovered device records ────────
router.delete("/clear", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await DiscoveredDevice.deleteMany({});
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
