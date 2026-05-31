const router = require("express").Router();
const AgentCommand = require("../models/AgentCommand");

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
router.post("/commands", async (req, res) => {
  try {
    const { hostname, kb } = req.body;
    if (!hostname || !kb) {
      return res.status(400).json({ ok: false, error: "hostname and kb required" });
    }
    const cmd = await AgentCommand.create({ hostname, kb });
    res.json({ ok: true, commandId: cmd._id });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// Frontend checks command status — GET /api/agent/commands/status/:commandId
router.get("/commands/status/:commandId", async (req, res) => {
  try {
    const cmd = await AgentCommand.findById(req.params.commandId).lean();
    if (!cmd) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, command: cmd });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;