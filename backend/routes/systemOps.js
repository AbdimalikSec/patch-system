const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const { spawn } = require("child_process");
const path = require("path");
const SystemJob = require("../models/SystemJob");

const BACKEND_DIR = path.join(__dirname, "..");

// ── Only these two jobs are exposed — no arbitrary script execution ─────────
const JOBS = {
  "compliance-rescan": "collectors_wazuh_indexer_sca.js",
  "cve-enrichment": "collectors_cve_enrichment.js",
};

// ── POST /api/system-ops/run/:job — start a job in the background ───────────
router.post("/run/:job", requireAuth, requireAdmin, async (req, res) => {
  try {
    const jobName = req.params.job;
    const script = JOBS[jobName];
    if (!script) {
      return res.status(400).json({ ok: false, error: `Unknown job "${jobName}"` });
    }

    const alreadyRunning = await SystemJob.findOne({ jobName, status: "running" });
    if (alreadyRunning) {
      return res.status(409).json({ ok: false, error: "This job is already running" });
    }

    const job = await SystemJob.create({
      jobName,
      status: "running",
      startedAt: new Date(),
    });

    // Spawned detached from the HTTP request — we respond immediately below,
    // the script keeps running and updates the job record when it finishes.
    const child = spawn("node", [script], { cwd: BACKEND_DIR });

    let output = "";
    child.stdout.on("data", (d) => { output += d.toString(); });
    child.stderr.on("data", (d) => { output += d.toString(); });

    child.on("close", async (code) => {
      try {
        await SystemJob.findByIdAndUpdate(job._id, {
          status: code === 0 ? "success" : "failed",
          output: output.slice(-4000), // keep the tail, avoid unbounded growth
          completedAt: new Date(),
        });
      } catch (e) {
        console.error("[system-ops] failed to record job completion:", e.message);
      }
    });

    res.json({ ok: true, jobId: job._id, message: `${jobName} started` });
  } catch (e) {
    console.error("[system-ops/run]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/system-ops/status/:job — latest run for a job ──────────────────
router.get("/status/:job", requireAuth, requireAdmin, async (req, res) => {
  try {
    const latest = await SystemJob.findOne({ jobName: req.params.job })
      .sort({ startedAt: -1 })
      .lean();
    res.json({ ok: true, job: latest || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
