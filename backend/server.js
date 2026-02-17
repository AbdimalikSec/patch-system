const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

const app = express();

app.use(cors());
app.use(express.json());

connectDB();

app.use("/api/ingest", require("./routes/ingest"));
app.use("/api/health", require("./routes/health"));
app.use("/api/patches", require("./routes/patches"));
app.use("/api/compliance", require("./routes/compliance"));
app.use("/api/meta", require("./routes/meta"));
app.use("/api/risk", require("./routes/risk"));
app.use("/api/assets", require("./routes/assets"));
app.use("/api/dashboard", require("./routes/dashboard"));


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
