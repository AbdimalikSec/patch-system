const router = require("express").Router();
const AgentCommand = require("../models/AgentCommand");
const { requireAuth, requireAdmin, requireRole } = require("../middleware/authMiddleware");
const Asset = require("../models/Asset");
const Patch = require("../models/Patch");

// Agent polls this — GET /api/agent/commands/:hostname
// No auth required — agent uses a shared secret instead
router.get("/commands/:hostname", async (req, res) => {
  const secret = req.headers["x-agent-secret"];
  if (secret !== "riskpatch-agent-2026") {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  try {
    const commands = await AgentCommand.find({
      hostname: { $regex: new RegExp(`^${req.params.hostname}$`, "i") },
      status: "pending",
    }).lean();
    res.json({ ok: true, commands });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// Agent reports result — POST /api/agent/report
router.post("/report", async (req, res) => {
  const secret = req.headers["x-agent-secret"];
  if (secret !== "riskpatch-agent-2026") {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  try {
    const { commandId, status, output } = req.body;
    await AgentCommand.findByIdAndUpdate(commandId, {
      status,
      output,
      completedAt: new Date(),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// Frontend/backend creates a command — POST /api/agent/commands
router.post("/commands", requireAuth, requireRole("admin", "patch-operator"), async (req, res) => {
  try {
    const { hostname, kb, type } = req.body;
    if (!hostname || !kb) {
      return res.status(400).json({ ok: false, error: "hostname and kb required" });
    }
    const cmd = await AgentCommand.create({
      hostname,
      kb,
      type: type || "patch",
      triggeredBy: req.user?.username || "unknown",
      triggeredById: req.user?._id,
    });
    res.json({ ok: true, commandId: cmd._id });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// Frontend checks command status — GET /api/agent/commands/status/:commandId
router.get("/commands/status/:commandId", requireAuth, requireRole("admin", "patch-operator"), async (req, res) => {
  try {
    const cmd = await AgentCommand.findById(req.params.commandId).lean();
    if (!cmd) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, command: cmd });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// Frontend fetches full patch history — GET /api/agent/history
router.get("/history", requireAuth, requireRole("admin", "compliance-officer", "patch-operator", "analyst"), async (req, res) => {
  try {
    const { hostname, status, limit } = req.query;
    const filter = {};
    if (hostname) filter.hostname = { $regex: new RegExp(`^${hostname}$`, "i") };
    if (status) filter.status = status;

    const commands = await AgentCommand.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) || 200)
      .lean();

    res.json({ ok: true, count: commands.length, data: commands });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/agent/reports/patch-velocity — successful patches over time,
// grouped by day and by machine, plus stale/never-patched machine detection.
router.get(
  "/reports/patch-velocity",
  requireAuth,
  requireRole("admin", "compliance-officer", "patch-operator", "analyst"),
  async (req, res) => {
    try {
      const { since, until } = req.query;
      const filter = { type: "patch", status: "success" };
      if (since || until) {
        filter.completedAt = {};
        if (since) filter.completedAt.$gte = new Date(since);
        if (until) filter.completedAt.$lte = new Date(until);
      } else {
        filter.completedAt = { $ne: null };
      }

      const successful = await AgentCommand.find(filter).lean();

      // By day
      const byDay = {};
      for (const c of successful) {
        if (!c.completedAt) continue;
        const day = new Date(c.completedAt).toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
      }

      // By machine
      const byMachine = {};
      for (const c of successful) {
        byMachine[c.hostname] = (byMachine[c.hostname] || 0) + 1;
      }

      // By operator (who triggered the patch)
      const byOperator = {};
      for (const c of successful) {
        const who = c.triggeredBy || "Unknown";
        byOperator[who] = (byOperator[who] || 0) + 1;
      }

      // Stale / never-patched machines — based on each asset's last patch
      // collection time (not the same as a patch being applied — this flags
      // machines whose missing-patch data itself hasn't refreshed recently,
      // a sign the collector or the machine may need attention).
      const assets = await Asset.find({}).lean();
      const staleThresholdDays = 7;
      const staleMachines = [];
      for (const a of assets) {
        const patchDoc = await Patch.findOne({ assetHostname: a.hostname }).sort({ collectedAt: -1 }).lean();
        const lastCollected = patchDoc?.collectedAt || null;
        const daysSince = lastCollected
          ? Math.floor((Date.now() - new Date(lastCollected).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        if (daysSince === null || daysSince >= staleThresholdDays) {
          staleMachines.push({
            hostname: a.hostname,
            lastCollected,
            daysSince,
            missingCount: patchDoc?.missingCount ?? null,
          });
        }
      }
      staleMachines.sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999));

      res.json({
        ok: true,
        totalPatched: successful.length,
        byDay,
        byMachine,
        byOperator,
        staleMachines,
        records: successful,
      });
    } catch (e) {
      console.error("[agent/reports/patch-velocity]", e.message);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  },
);

module.exports = router;
