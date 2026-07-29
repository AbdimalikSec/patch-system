const router = require("express").Router();
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const UserActivity = require("../models/UserActivity");
const { createNotification } = require("../utils/notify");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

const JWT_SECRET  = process.env.JWT_SECRET  || "riskpatch-secret-change-in-prod";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "8h";

// ── Validation helpers ────────────────────────────────────────────────────────
function validateUsername(val) {
  if (!val || typeof val !== "string") return "Username is required.";
  const u = val.trim();
  if (u.length < 3) return "Username must be at least 3 characters.";
  if (u.length > 32) return "Username must be 32 characters or fewer.";
  if (/^\d+$/.test(u)) return "Username cannot be numbers only.";
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) return "Username can only contain letters, numbers, dots, hyphens, and underscores.";
  return "";
}

function validatePassword(val) {
  if (!val || typeof val !== "string") return "Password is required.";
  if (val.length < 8) return "Password must be at least 8 characters.";
  if (val.length > 128) return "Password is too long.";
  return "";
}

const BRUTEFORCE_WINDOW_MIN = 10;
const BRUTEFORCE_THRESHOLD = 5;
const BRUTEFORCE_COOLDOWN_MIN = 30;

// Fires an admin alert if a username has crossed the recent-failure threshold,
// throttled so a sustained attack doesn't spam one notification per attempt.
async function checkBruteForce(attemptedUsername) {
  try {
    const windowStart = new Date(Date.now() - BRUTEFORCE_WINDOW_MIN * 60 * 1000);
    const recentFailures = await UserActivity.countDocuments({
      username: attemptedUsername,
      action: "login_failed",
      createdAt: { $gte: windowStart },
    });
    const totalIncludingThisAttempt = recentFailures + 1;
    if (totalIncludingThisAttempt < BRUTEFORCE_THRESHOLD) return;

    const cooldownStart = new Date(Date.now() - BRUTEFORCE_COOLDOWN_MIN * 60 * 1000);
    const Notification = require("../models/Notification");
    const alreadyNotified = await Notification.findOne({
      type: "login_bruteforce",
      message: { $regex: attemptedUsername },
      createdAt: { $gte: cooldownStart },
    });
    if (alreadyNotified) return;

    createNotification({
      type: "login_bruteforce",
      severity: "critical",
      title: "Possible brute-force login attempt",
      message: `${totalIncludingThisAttempt} failed login attempts for username "${attemptedUsername}" in the last ${BRUTEFORCE_WINDOW_MIN} minutes`,
      targetRoles: ["admin"],
    });
  } catch (e) {
    console.error("[checkBruteForce]", e.message);
  }
}

// Flags a successful login from an IP this user has never logged in from
// before. Skips entirely on a user's very first-ever login, since there's
// no baseline yet to call anything "unfamiliar."
async function checkUnfamiliarLocation(username, ip, role) {
  try {
    if (!ip) return;

    const priorLogins = await UserActivity.countDocuments({
      username,
      action: "login_success",
    });
    if (priorLogins === 0) return; // first login ever — nothing to compare against

    const seenThisIP = await UserActivity.findOne({
      username,
      action: "login_success",
      ip,
    });
    if (seenThisIP) return; // already logged in from this IP before

    createNotification({
      type: "login_unfamiliar_location",
      severity: "warning",
      title: "Login from a new location",
      message: `${username} logged in from a new IP address (${ip}) not seen before for this account`,
      targetUsername: username,
    });
    createNotification({
      type: "login_unfamiliar_location",
      severity: "warning",
      title: `New login location for ${username}`,
      message: `${username} (${role}) logged in from a new IP address (${ip})`,
      targetRoles: ["admin"],
    });
  } catch (e) {
    console.error("[checkUnfamiliarLocation]", e.message);
  }
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Username and password required" });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      checkBruteForce(username.toLowerCase().trim());
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      checkBruteForce(username.toLowerCase().trim());
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    const loginIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    checkUnfamiliarLocation(user.username, loginIp, user.role);

    res.json({
      ok: true,
      token,
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// PUT /api/auth/me/password — self-service password change (any logged-in user)
router.put("/me/password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: "Current and new password required" });
    }

    const pErr = validatePassword(newPassword);
    if (pErr) return res.status(400).json({ ok: false, error: pErr });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    const valid = await user.comparePassword(currentPassword);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Current password is incorrect" });
    }

    user.password = newPassword; // pre-save hook hashes this, same pattern as the admin edit route
    await user.save();

    res.json({ ok: true, message: "Password updated successfully" });
  } catch (e) {
    console.error("Change own password error:", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/auth/seed
router.post("/seed", async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      return res.status(403).json({ ok: false, error: "Users already seeded" });
    }
    await User.create([
      { username: "admin",   password: "Admin@RiskPatch1",   role: "admin"   },
      { username: "analyst", password: "Analyst@RiskPatch1", role: "analyst" },
    ]);
    res.json({ ok: true, message: "Default users created. Change passwords immediately." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/auth/users
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("-password").lean();
    res.json({ ok: true, data: users });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/auth/users
router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Server-side validation — cannot be bypassed by frontend
    const uErr = validateUsername(username);
    if (uErr) return res.status(400).json({ ok: false, error: uErr });

    const pErr = validatePassword(password);
    if (pErr) return res.status(400).json({ ok: false, error: pErr });

    const allowedRoles = ["admin", "analyst", "auditor", "compliance-officer", "patch-operator"];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ ok: false, error: "Invalid role. Must be admin, analyst, or auditor." });
    }

    const user = await User.create({
      username: username.trim().toLowerCase(),
      password,
      role: role || "analyst"
    });

    res.json({ ok: true, user: { id: user._id, username: user.username, role: user.role } });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ ok: false, error: "Username already exists" });
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// PUT /api/auth/users/:id - update username, role, and/or password
router.put("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, role, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });

    if (username && username.trim()) {
      const existing = await User.findOne({ username: username.trim().toLowerCase(), _id: { $ne: user._id } });
      if (existing) return res.status(409).json({ ok: false, error: "username_taken" });
      user.username = username.trim().toLowerCase();
    }

    if (role && ["admin", "analyst", "auditor"].includes(role)) {
      user.role = role;
    }

    if (password && password.length >= 8) {
      user.password = password; // assumes pre-save hook hashes this, same as create route
    }

    await user.save();
    res.json({ ok: true, data: { id: user._id, username: user.username, role: user.role } });
  } catch (e) {
    console.error("Update user error:", e.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// DELETE /api/auth/users/:id
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user.id) {
      return res.status(400).json({ ok: false, error: "You cannot delete your own account." });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});


module.exports = router;
