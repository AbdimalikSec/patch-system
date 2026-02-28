const router = require("express").Router();
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

const JWT_SECRET  = process.env.JWT_SECRET  || "riskpatch-secret-change-in-prod";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "8h";

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

// GET /api/auth/me — verify token and return current user
router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// POST /api/auth/seed — create default users (run once, admin only after first user exists)
// If no users exist, allow open seeding so you can bootstrap
router.post("/seed", async (req, res) => {
  try {
    const count = await User.countDocuments();

    // Only allow seeding if no users exist yet
    if (count > 0) {
      return res.status(403).json({ ok: false, error: "Users already seeded" });
    }

    await User.create([
      { username: "admin",   password: "Admin@RiskPatch1", role: "admin"   },
      { username: "analyst", password: "Analyst@RiskPatch1", role: "analyst" },
    ]);

    res.json({ ok: true, message: "Default users created. Change passwords immediately." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/auth/users — list all users (admin only)
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("-password").lean();
    res.json({ ok: true, data: users });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/auth/users — create a new user (admin only)
router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Username and password required" });
    }
    const user = await User.create({ username, password, role: role || "analyst" });
    res.json({ ok: true, user: { id: user._id, username: user.username, role: user.role } });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ ok: false, error: "Username already exists" });
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// DELETE /api/auth/users/:id — delete a user (admin only)
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;