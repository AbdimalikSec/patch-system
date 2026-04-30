const router = require("express").Router();
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
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

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Username and password required" });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

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

    const allowedRoles = ["admin", "analyst", "auditor"];
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