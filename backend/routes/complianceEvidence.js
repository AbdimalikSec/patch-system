const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { getISOControl } = require("../utils/isoMapping");
const ComplianceEvidence = require("../models/ComplianceEvidence");
const ComplianceCheck = require("../models/ComplianceCheck");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

// Storage lives outside anything nginx serves as static files — every
// download goes through the authenticated route below, never a direct URL.
const STORAGE_DIR = path.join(__dirname, "..", "storage", "compliance-evidence");
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STORAGE_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`File type ${file.mimetype} not allowed. Accepted: PDF, Word, PNG, JPEG.`));
    }
    cb(null, true);
  },
});

// GET /api/compliance-evidence/controls — the real ISO controls currently
// mapped from live CIS check titles, computed the same way compliance.js
// does it (isoMapping is applied at request time, never stored on the
// document itself), so the upload picker reflects controls that actually
// exist in this system rather than a hardcoded static list.
router.get(
  "/controls",
  requireAuth,
  requireRole("admin", "compliance-officer", "analyst", "auditor"),
  async (req, res) => {
    try {
      // Distinct titles only — running getISOControl per-document would be
      // wasteful across ~3000 checks when most titles repeat across assets.
      const titles = await ComplianceCheck.distinct("title");

      const controlSet = new Map(); // controlId -> { controlId, domain }
      for (const title of titles) {
        const mapped = getISOControl(title);
        if (mapped && mapped.control) {
          controlSet.set(mapped.control, { controlId: mapped.control, domain: mapped.domain || "" });
        }
      }

      const controls = Array.from(controlSet.values()).sort((a, b) => a.controlId.localeCompare(b.controlId));
      res.json({ ok: true, data: controls });
    } catch (e) {
      console.error("[compliance-evidence/controls]", e.message);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  },
);


// GET /api/compliance-evidence — list all evidence, optionally filtered by control
router.get(
  "/",
  requireAuth,
  requireRole("admin", "compliance-officer", "analyst", "auditor"),
  async (req, res) => {
    try {
      const filter = { supersededBy: null };
      if (req.query.controlId) filter.controlId = req.query.controlId;
      const evidence = await ComplianceEvidence.find(filter).sort({ uploadedAt: -1 }).lean();
      res.json({ ok: true, count: evidence.length, data: evidence });
    } catch (e) {
      res.status(500).json({ ok: false, error: "server_error" });
    }
  },
);

// POST /api/compliance-evidence — upload a new document
router.post(
  "/",
  requireAuth,
  requireRole("admin", "compliance-officer"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });
      const { controlId, controlName, category, notes, supersedes } = req.body;
      if (!controlId) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ ok: false, error: "controlId is required" });
      }

      const record = await ComplianceEvidence.create({
        controlId,
        controlName: controlName || "",
        category: category || "other",
        originalFileName: req.file.originalname,
        storedFileName: req.file.filename,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        notes: notes || "",
        uploadedBy: req.user.username,
      });

      // If this upload explicitly supersedes an older document, mark the
      // old one rather than deleting it — keeps a real history.
      if (supersedes) {
        await ComplianceEvidence.findByIdAndUpdate(supersedes, { supersededBy: record._id });
      }

      res.json({ ok: true, data: record });
    } catch (e) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      console.error("[compliance-evidence upload]", e.message);
      res.status(400).json({ ok: false, error: e.message || "Upload failed" });
    }
  },
);

// GET /api/compliance-evidence/:id/download — authenticated file download.
// The file is never reachable by direct URL — every request is checked
// against the same role/auth rules as the rest of this route file.
router.get(
  "/:id/download",
  requireAuth,
  requireRole("admin", "compliance-officer", "analyst", "auditor"),
  async (req, res) => {
    try {
      const record = await ComplianceEvidence.findById(req.params.id).lean();
      if (!record) return res.status(404).json({ ok: false, error: "Not found" });

      const filePath = path.join(STORAGE_DIR, record.storedFileName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ ok: false, error: "File missing on disk" });
      }

      res.setHeader("Content-Type", record.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${record.originalFileName}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.status(500).json({ ok: false, error: "server_error" });
    }
  },
);

// DELETE /api/compliance-evidence/:id — remove a document (metadata + file)
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin", "compliance-officer"),
  async (req, res) => {
    try {
      const record = await ComplianceEvidence.findById(req.params.id);
      if (!record) return res.status(404).json({ ok: false, error: "Not found" });

      const filePath = path.join(STORAGE_DIR, record.storedFileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await ComplianceEvidence.findByIdAndDelete(req.params.id);

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: "server_error" });
    }
  },
);

module.exports = router;
