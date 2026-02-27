const mongoose = require("mongoose");

/**
 * CVEMatch — stores CVE/vulnerability data matched to an asset's missing patches.
 *
 * Sources:
 *   Windows : Microsoft MSRC API (api.msrc.microsoft.com)
 *   Linux   : Debian Security Tracker (security-tracker.debian.org)
 *
 * CVSS scoring uses v3.1 base score (0.0–10.0):
 *   Critical  9.0–10.0
 *   High      7.0–8.9
 *   Medium    4.0–6.9
 *   Low       0.1–3.9
 */
const CVEMatchSchema = new mongoose.Schema(
  {
    assetHostname: { type: String, required: true, index: true },
    os:            { type: String, enum: ["windows", "linux"], required: true },

    // The patch/package that has this vulnerability
    patchRef:      { type: String, required: true }, // KB number or package name
    patchTitle:    { type: String, default: "" },

    // CVE details
    cveId:         { type: String, required: true }, // e.g. CVE-2024-38080
    cvssScore:     { type: Number, default: 0 },     // 0.0–10.0
    cvssVector:    { type: String, default: "" },
    severity:      { type: String, default: "Unknown" }, // Critical/High/Medium/Low/Unknown
    description:   { type: String, default: "" },

    // Source metadata
    source:        { type: String, default: "" }, // msrc | debian
    collectedAt:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Unique: one CVE per patch per asset (avoid duplicates on re-run)
CVEMatchSchema.index({ assetHostname: 1, patchRef: 1, cveId: 1 }, { unique: true });

module.exports = mongoose.model("CVEMatch", CVEMatchSchema);