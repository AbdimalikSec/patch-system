const router = require("express").Router();
const { requireAuth, requireAdmin,requireRole  } = require("../middleware/authMiddleware");
const UserActivity = require("../models/UserActivity");

// ── GET /api/user-activity/summary — login/action counts per user ───────────
router.get("/summary", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
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
router.get("/", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { username, action, limit, since, until } = req.query;
    const filter = {};
    if (username) filter.username = username;
    if (action === "logins") filter.action = { $in: ["login_success", "login_failed"] };
    else if (action === "actions") filter.action = { $nin: ["login_success", "login_failed"] };

    if (since || until) {
      filter.createdAt = {};
      if (since) filter.createdAt.$gte = new Date(since);
      if (until) filter.createdAt.$lte = new Date(until);
    }

    const records = await UserActivity.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) || 1000)
      .lean();

    res.json({ ok: true, count: records.length, data: records });
  } catch (e) {
    console.error("[user-activity]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});
// ── GET /api/user-activity/me — a user's own activity, no admin required ────
router.get("/me", requireAuth, async (req, res) => {
  try {
    const username = req.user.username;
    const records = await UserActivity.find({ username })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const logins = records.filter((r) => r.action === "login_success").length;
    const failedLogins = records.filter((r) => r.action === "login_failed").length;
    const actions = records.filter(
      (r) => r.action !== "login_success" && r.action !== "login_failed"
    ).length;
    const lastLogin = records.find((r) => r.action === "login_success")?.createdAt || null;

    res.json({
      ok: true,
      summary: { logins, failedLogins, actions, lastLogin },
      data: records,
    });
  } catch (e) {
    console.error("[user-activity/me]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
