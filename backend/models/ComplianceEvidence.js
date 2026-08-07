const mongoose = require("mongoose");

/**
 * ComplianceEvidence — human-uploaded documents (policies, training records,
 * disaster-recovery plans, etc.) linked to a specific ISO 27001:2022 control.
 * This is the "paperwork" side of compliance — the ~70% of ISO 27001 that
 * describes organizational process rather than a technical setting, which
 * no scanner (Wazuh or otherwise) can ever verify on its own.
 *
 * Files are stored on disk, NOT in MongoDB — this collection only holds
 * metadata and a pointer to the stored file.
 */
const ComplianceEvidenceSchema = new mongoose.Schema(
  {
    controlId: { type: String, required: true },       // e.g. "A.6.3" or a free-text control name
    controlName: { type: String, default: "" },          // human-readable label
    category: {
      type: String,
      enum: ["policy", "training-record", "risk-assessment", "disaster-recovery", "audit-report", "other"],
      default: "other",
    },
    originalFileName: { type: String, required: true },  // what the user uploaded it as
    storedFileName: { type: String, required: true },    // actual unique name on disk
    fileSize: { type: Number, required: true },           // bytes
    mimeType: { type: String, required: true },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    // Tracks whether an expiring-soon alert has already been sent for the
    // CURRENT expiresAt value, so the daily check doesn't re-notify every
    // single day during the 30-day warning window.
    expiryNotifiedAt: { type: Date, default: null },
    // Superseded documents are kept for history rather than deleted outright
    // when a newer version of the same evidence is uploaded.
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: "ComplianceEvidence", default: null },
  },
  { timestamps: true },
);

ComplianceEvidenceSchema.index({ controlId: 1 });

module.exports = mongoose.model("ComplianceEvidence", ComplianceEvidenceSchema);
