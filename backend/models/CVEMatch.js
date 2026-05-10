const mongoose = require("mongoose");

/**
 * CVEMatch — stores CVE/vulnerability data matched to an asset's missing patches.
 *
 * Sources:
 *   Windows : Microsoft MSRC API (api.msrc.microsoft.com)
 *   Linux   : Debian Security Tracker (security-tracker.debian.org)
 *
 * Exploit intelligence:
 *   cve.circl.lu API checked for known public exploits
 *   hasExploit = true means working exploit code exists publicly
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

    patchRef:    { type: String, required: true },
    patchTitle:  { type: String, default: "" },

    cveId:       { type: String, required: true },
    cvssScore:   { type: Number, default: 0 },
    cvssVector:  { type: String, default: "" },
    severity:    { type: String, default: "Unknown" },
    description: { type: String, default: "" },

    // Exploit intelligence
    hasExploit:  { type: Boolean, default: false },
    exploitRefs: { type: [String], default: [] },

    source:      { type: String, default: "" },
    collectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CVEMatchSchema.index({ assetHostname: 1, patchRef: 1, cveId: 1 }, { unique: true });

module.exports = mongoose.model("CVEMatch", CVEMatchSchema);