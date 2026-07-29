const router = require("express").Router();
const ComplianceCheck = require("../models/ComplianceCheck");
const Notification = require("../models/Notification");
const { requireAuth } = require("../middleware/authMiddleware");

// GET /api/notifications/new-failures?since=<ISO timestamp>
// Returns compliance checks that newly failed since the given timestamp
router.get("/new-failures", requireAuth, async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : null;

    if (!since || isNaN(since.getTime())) {
      return res.status(400).json({ ok: false, error: "since timestamp required" });
    }

    // Find checks that are currently failed AND were updated after login time
    const newFailures = await ComplianceCheck.find({
      result: "failed",
      statusChangedAt: { $gt: since },
    })
      .select("assetHostname checkId title result updatedAt policy")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    res.json({ ok: true, count: newFailures.length, data: newFailures });
  } catch (e) {
    console.error("Notifications error:", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/notifications — all notifications visible to the logged-in user,
// whether targeted at their specific username or at their role.
router.get("/", requireAuth, async (req, res) => {
  try {
    const { username, role } = req.user;
    const limit = parseInt(req.query.limit) || 50;

    const notifications = await Notification.find({
      $or: [{ targetUsername: username }, { targetRoles: role }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const withReadState = notifications.map((n) => ({
      ...n,
      isRead: (n.readBy || []).includes(username),
    }));

    const unreadCount = withReadState.filter((n) => !n.isRead).length;

    res.json({ ok: true, count: withReadState.length, unreadCount, data: withReadState });
  } catch (e) {
    console.error("[notifications]", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/notifications/:id/read — mark one notification read for the current user
router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: req.user.username },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/notifications/read-all — mark every currently-visible notification read
router.post("/read-all", requireAuth, async (req, res) => {
  try {
    const { username, role } = req.user;
    await Notification.updateMany(
      { $or: [{ targetUsername: username }, { targetRoles: role }] },
      { $addToSet: { readBy: username } },
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
