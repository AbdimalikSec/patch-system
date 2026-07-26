const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
require("dotenv").config();
const activityLogger = require("./middleware/activityLogger");
const connectDB = require("./config/db");
const { requireAuth } = require("./middleware/authMiddleware");

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
app.use("/api/agent",         require("./routes/agentCommands"));
app.use("/api/tickets",       requireAuth, require("./routes/tickets"));
app.use("/api/deploy",        requireAuth, require("./routes/deploy"));
app.use("/api/audit-log", require("./routes/auditLog"));
app.use("/api/discovery", require("./routes/discovery"));
app.use("/api/user-activity", require("./routes/userActivity"));
app.use("/api/system-ops", require("./routes/systemOps"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
