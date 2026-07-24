const UserActivity = require("../models/UserActivity");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Fields we never want stored, even though we log request bodies for context.
const SENSITIVE_FIELDS = ["password", "newPassword", "sshKeyPath"];

function sanitizeBody(body) {
  if (!body || typeof body !== "object") return {};
  const clone = { ...body };
  for (const field of SENSITIVE_FIELDS) delete clone[field];
  return clone;
}

function activityLogger(req, res, next) {
  const isLoginRoute = req.originalUrl.startsWith("/api/auth/login");

  // Only log mutating requests, plus the login route specifically (which is
  // POST anyway, so it's covered by MUTATING_METHODS — kept explicit for clarity).
  if (!MUTATING_METHODS.has(req.method) && !isLoginRoute) {
    return next();
  }

  res.on("finish", () => {
    // req.user is populated by requireAuth earlier in the middleware chain,
    // by the time this 'finish' event fires (after the route handler ran).
    const loggedInUser = req.user;
    const attemptedUsername = req.body?.username;

    const username = loggedInUser?.username || (isLoginRoute ? (attemptedUsername || "unknown") : "anonymous");
    const role = loggedInUser?.role || "-";

    let action;
    if (isLoginRoute) {
      action = res.statusCode === 200 ? "login_success" : "login_failed";
    } else {
      action = `${req.method} ${req.originalUrl}`;
    }

    UserActivity.create({
      userId: loggedInUser?._id || null,
      username,
      role,
      action,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
      body: sanitizeBody(req.body),
    }).catch((e) => console.error("[activityLogger] failed to log:", e.message));
  });

  next();
}

module.exports = activityLogger;
