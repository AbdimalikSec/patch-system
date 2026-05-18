const router = require("express").Router();
const Ticket = require("../models/Ticket");

// GET /api/tickets/:hostname — all tickets for an asset
router.get("/:hostname", async (req, res) => {
  try {
    const tickets = await Ticket.find({ assetHostname: req.params.hostname })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ ok: true, count: tickets.length, data: tickets });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/tickets/:hostname/map — returns { checkId: ticket } map for quick lookup
router.get("/:hostname/map", async (req, res) => {
  try {
    const tickets = await Ticket.find({ assetHostname: req.params.hostname }).lean();
    const map = {};
    for (const t of tickets) map[t.checkId] = t;
    res.json({ ok: true, data: map });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/tickets — create a new ticket
router.post("/", async (req, res) => {
  try {
    const { assetHostname, checkId, title, remediation, priority, assignedTo, notes } = req.body;
    if (!assetHostname || !checkId || !title) {
      return res.status(400).json({ ok: false, error: "assetHostname, checkId, and title are required" });
    }
    const createdBy = req.user?.username || "system";
    const ticket = await Ticket.create({
      assetHostname, checkId, title, remediation,
      priority: priority || "Medium",
      assignedTo: assignedTo || "",
      notes: notes || "",
      createdBy,
    });
    res.json({ ok: true, data: ticket });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ ok: false, error: "A ticket already exists for this check on this asset" });
    }
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// PATCH /api/tickets/:id — update status, assignedTo, notes
router.patch("/:id", async (req, res) => {
  try {
    const { status, assignedTo, notes, priority } = req.body;
    const update = {};
    if (status)     update.status     = status;
    if (assignedTo !== undefined) update.assignedTo = assignedTo;
    if (notes !== undefined)      update.notes      = notes;
    if (priority)   update.priority   = priority;
    if (status === "resolved") update.resolvedAt = new Date();
    if (status === "open" || status === "in-progress") update.resolvedAt = null;

    const ticket = await Ticket.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!ticket) return res.status(404).json({ ok: false, error: "Ticket not found" });
    res.json({ ok: true, data: ticket });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// DELETE /api/tickets/:id — delete a ticket
router.delete("/:id", async (req, res) => {
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/tickets — all tickets across all assets (for overview)
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, count: tickets.length, data: tickets });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;