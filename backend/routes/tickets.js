const router = require("express").Router();
const Ticket = require("../models/Ticket");
const { requireRole } = require("../middleware/authMiddleware");

// GET /api/tickets/:hostname — all tickets for an asset
// Read access: everyone who can see Tickets per the matrix (not patch-operator)
// GET /api/tickets/reports/resolution-velocity — resolved tickets over time,
// grouped by machine and by assignee. Read access matches Tickets view.
router.get(
  "/reports/resolution-velocity",
  requireRole("admin", "compliance-officer", "analyst", "auditor"),
  async (req, res) => {
    try {
      const { since, until } = req.query;
      const filter = { status: "resolved", resolvedAt: { $ne: null } };
      if (since || until) {
        filter.resolvedAt = { ...filter.resolvedAt };
        if (since) filter.resolvedAt.$gte = new Date(since);
        if (until) filter.resolvedAt.$lte = new Date(until);
      }

      const resolved = await Ticket.find(filter).lean();

      // By day
      const byDay = {};
      for (const t of resolved) {
        const day = new Date(t.resolvedAt).toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
      }

      // By machine
      const byMachine = {};
      for (const t of resolved) {
        byMachine[t.assetHostname] = (byMachine[t.assetHostname] || 0) + 1;
      }

      // By assignee (who owned it when it was marked resolved)
      const byAssignee = {};
      for (const t of resolved) {
        const who = t.assignedTo || "Unassigned";
        byAssignee[who] = (byAssignee[who] || 0) + 1;
      }

      // Average time-to-resolution (createdAt -> resolvedAt), in hours
      const resolutionTimes = resolved
        .filter((t) => t.createdAt && t.resolvedAt)
        .map((t) => (new Date(t.resolvedAt) - new Date(t.createdAt)) / (1000 * 60 * 60));
      const avgResolutionHours = resolutionTimes.length
        ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
        : null;

      res.json({
        ok: true,
        totalResolved: resolved.length,
        byDay,
        byMachine,
        byAssignee,
        avgResolutionHours,
        records: resolved,
      });
    } catch (e) {
      console.error("[tickets/reports/resolution-velocity]", e.message);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  },
);

// PATCH /api/tickets/bulk-status — change status for many tickets at once
// Write access: admin and compliance-officer only
router.patch("/bulk-status", requireRole("admin", "compliance-officer"), async (req, res) => {
  try {
    const { ticketIds, status } = req.body;
    const allowedStatuses = ["open", "in-progress", "resolved"];
    if (!Array.isArray(ticketIds) || ticketIds.length === 0 || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: "ticketIds (array) and a valid status (open, in-progress, resolved) are required",
      });
    }

    const update = { status };
    if (status === "resolved") update.resolvedAt = new Date();
    if (status === "open" || status === "in-progress") update.resolvedAt = null;

    const result = await Ticket.updateMany(
      { _id: { $in: ticketIds } },
      { $set: update },
    );
    res.json({ ok: true, modified: result.modifiedCount, status });
  } catch (e) {
    console.error("[tickets/bulk-status]", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});


router.get("/:hostname", requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
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
router.get("/:hostname/map", requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
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
// Write access: admin and compliance-officer only
router.post("/", requireRole("admin", "compliance-officer"), async (req, res) => {
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

// PATCH /api/tickets/bulk-assign — assign many tickets to one user at once
// Write access: admin and compliance-officer only
router.patch("/bulk-assign", requireRole("admin", "compliance-officer"), async (req, res) => {
  try {
    const { ticketIds, assignedTo } = req.body;
    if (!Array.isArray(ticketIds) || ticketIds.length === 0 || !assignedTo) {
      return res.status(400).json({
        ok: false,
        error: "ticketIds (array) and assignedTo are required",
      });
    }
    const result = await Ticket.updateMany(
      { _id: { $in: ticketIds } },
      { $set: { assignedTo, status: "in-progress" } }
    );
    res.json({ ok: true, modified: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// PATCH /api/tickets/:id — update status, assignedTo, notes
// Write access: admin and compliance-officer only
router.patch("/:id", requireRole("admin", "compliance-officer"), async (req, res) => {
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
// Write access: admin and compliance-officer only
router.delete("/:id", requireRole("admin", "compliance-officer"), async (req, res) => {
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});


// GET /api/tickets — all tickets across all assets (for overview)
router.get("/", requireRole("admin", "compliance-officer", "analyst", "auditor"), async (req, res) => {
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
