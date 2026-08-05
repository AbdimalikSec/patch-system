const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
require("dotenv").config();
const activityLogger = require("./middleware/activityLogger");
const connectDB = require("./config/db");
const { requireAuth } = require("./middleware/authMiddleware");
const { startMaintenanceScheduler } = require("./maintenanceScheduler");
const { runSelfAudit } = require("./collectors_self_audit");

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startMaintenanceScheduler();

  // Run once at startup, then daily thereafter
  runSelfAudit().catch((e) => console.error("[selfAudit] startup run failed:", e.message));
  setInterval(() => {
    runSelfAudit().catch((e) => console.error("[selfAudit] scheduled run failed:", e.message));
  }, SELF_AUDIT_INTERVAL_MS);
});
