const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");
const { requireAuth } = require("./middleware/authMiddleware");

const app = express();
app.use(cors());
app.use(express.json());

connectDB();

// ── Public routes ─────────────────────────────────────────────────────────────
app.use("/api/auth",   require("./routes/auth"));
app.use("/api/ingest", require("./routes/ingest"));
app.use("/api/health", require("./routes/health"));

// ── Protected routes ──────────────────────────────────────────────────────────
app.use("/api/patches",    requireAuth, require("./routes/patches"));
app.use("/api/compliance", requireAuth, require("./routes/compliance"));
app.use("/api/meta",       requireAuth, require("./routes/meta"));
app.use("/api/risk",       requireAuth, require("./routes/risk"));
app.use("/api/assets",     requireAuth, require("./routes/assets"));
app.use("/api/dashboard",  requireAuth, require("./routes/dashboard"));
app.use("/api/agents",     requireAuth, require("./routes/agents"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));