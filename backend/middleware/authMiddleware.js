const jwt  = require("jsonwebtoken");
const User = require("../models/User");
const JWT_SECRET = process.env.JWT_SECRET || "riskpatch-secret-change-in-prod";
// Verify JWT and attach user to request
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: "No token provided" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const user    = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ ok: false, error: "User not found" });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}
// Only allow admin role
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }
  next();
}
// Generalized role gate — pass any number of allowed roles.
// Usage: requireRole("admin", "compliance-officer")
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({
        ok: false,
        error: `Access restricted to: ${allowedRoles.join(", ")}`,
      });
    }
    next();
  };
}
module.exports = { requireAuth, requireAdmin, requireRole };
