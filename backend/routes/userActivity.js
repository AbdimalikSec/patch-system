const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const UserActivity = require("../models/UserActivity");

// ── GET /api/user-activity/summary — login/action counts per user ───────────
router.get("/summary", requireAuth, requireAdmin, async (req, res) => {
  try {
    const all = await UserActivity.find({}).lean();
    const byUser = new Map();

    for (const a of all) {
      if (!byUser.has(a.username)) {
        byUser.set(a.username, {
          username: a.username,
          role: a.role,
          logins: 0,
          failedLogins: 0,
          actions: 0,
          lastSeen: a.createdAt,
        });
      }
      const g = byUser.get(a.username);
      if (a.action === "login_success") g.logins++;
      else if (a.action === "login_failed") g.failedLogins++;
      else g.actions++;
      if (new Date(a.createdAt) > new Date(g.lastSeen)) g.lastSeen = a.createdAt;
    }

    res.json({ ok: true, data: Array.from(byUser.values()) });
  } catch (e) {
    console.error("[user-activity/summary]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/user-activity — full filterable activity list ──────────────────
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, action, limit } = req.query;
    const filter = {};
    if (username) filter.username = username;
    if (action === "logins") filter.action = { $in: ["login_success", "login_failed"] };
    else if (action === "actions") filter.action = { $nin: ["login_success", "login_failed"] };

    const records = await UserActivity.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) || 300)
      .lean();

    res.json({ ok: true, count: records.length, data: records });
  } catch (e) {
    console.error("[user-activity]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
