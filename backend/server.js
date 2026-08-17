const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
require("dotenv").config();
const activityLogger = require("./middleware/activityLogger");
const connectDB = require("./config/db");
const { requireAuth } = require("./middleware/authMiddleware");
const { startMaintenanceScheduler } = require("./maintenanceScheduler");
const { startComplianceEvidenceScheduler } = require("./complianceEvidenceScheduler");
const { startCommandTimeoutScheduler } = require("./commandTimeoutScheduler");
const { runOsValidation } = require("./collectors_os_validation");
const { runSelfAudit } = require("./collectors_self_audit");
const { runDebianTrackerFallback } = require("./collectors_debian_tracker_fallback");

const app = express();
app.use(cors());
app.use(express.json());
app.use(activityLogger);
connectDB();

// ── Public routes ─────────────────────────────────────────────────────────────
app.use("/api/auth",         require("./routes/auth"));
app.use("/api/ingest",       require("./routes/ingest"));
app.use("/api/health",       require("./routes/health"));

// ── Protected routes ──────────────────────────────────────────────────────────
app.use("/api/patches",       requireAuth, require("./routes/patches"));
app.use("/api/compliance",    requireAuth, require("./routes/compliance"));
app.use("/api/platform-compliance", require("./routes/platformCompliance"));
app.use("/api/compliance-evidence", require("./routes/complianceEvidence"));
app.use("/api/meta",          requireAuth, require("./routes/meta"));
app.use("/api/risk",          requireAuth, require("./routes/risk"));
app.use("/api/assets",        requireAuth, require("./routes/assets"));
app.use("/api/dashboard",     requireAuth, require("./routes/dashboard"));
app.use("/api/agents",        requireAuth, require("./routes/agents"));
app.use("/api/machines", require("./routes/machines"));
app.use("/api/vulnerabilities", require("./routes/vulnerabilities"));
app.use("/api/notifications", requireAuth, require("./routes/notifications"));
app.use("/api/snapshots",     requireAuth, require("./routes/snapshots"));
app.use("/api/groups",        requireAuth, require("./routes/groups"));
app.use("/api/maintenance-schedules", require("./routes/maintenanceSchedules"));
app.use("/api/agent",         require("./routes/agentCommands"));
app.use("/api/tickets",       requireAuth, require("./routes/tickets"));
app.use("/api/compliance-history", require("./routes/complianceHistory"));
app.use("/api/deploy",        requireAuth, require("./routes/deploy"));
app.use("/api/audit-log", require("./routes/auditLog"));
app.use("/api/discovery", require("./routes/discovery"));
app.use("/api/user-activity", require("./routes/userActivity"));
app.use("/api/system-ops", require("./routes/systemOps"));
const PORT = process.env.PORT || 5000;
const SELF_AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day — dependency CVEs don't change fast
const DEBIAN_FALLBACK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day — installed packages don't change fast either

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startMaintenanceScheduler();
  startComplianceEvidenceScheduler();
  startCommandTimeoutScheduler();
  setTimeout(() => {
    runOsValidation().catch((e) => console.error("[osValidation] startup run failed:", e.message));
  }, 60000); // delayed well clear of startup, same lesson as tonight's other two fixes
  setInterval(() => {
    runOsValidation().catch((e) => console.error("[osValidation] scheduled run failed:", e.message));
  }, 24 * 60 * 60 * 1000);
  // Delayed by 30 seconds so these don't compete with Mongoose's own
  // connection handshake right at startup — running them in the same tick
  // as server boot was causing a real crash loop (see notes below).
  setTimeout(() => {
    runSelfAudit().catch((e) => console.error("[selfAudit] startup run failed:", e.message));
  }, 30000);
  setInterval(() => {
    runSelfAudit().catch((e) => console.error("[selfAudit] scheduled run failed:", e.message));
  }, SELF_AUDIT_INTERVAL_MS);

  setTimeout(() => {
    runDebianTrackerFallback().catch((e) => console.error("[debianTrackerFallback] startup run failed:", e.message));
  }, 45000);
  setInterval(() => {
    runDebianTrackerFallback().catch((e) => console.error("[debianTrackerFallback] scheduled run failed:", e.message));
  }, DEBIAN_FALLBACK_INTERVAL_MS);
});
