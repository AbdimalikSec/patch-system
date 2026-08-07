const mongoose = require("mongoose");

/**
 * SupplementalVulnMatch — installed-software CVE matches found by OUR OWN
 * Debian Security Tracker lookup, for agents where Wazuh's native
 * vulnerability-detection engine has no coverage (e.g. kali-rolling, whose
 * OS identifier doesn't match Wazuh's Debian vendor feed logic). This
 * supplements, never replaces, Wazuh's own vulnerability data — merged
 * together in getVulnMatchesForAgent().
 */
const SupplementalVulnMatchSchema = new mongoose.Schema(
  {
    hostname: { type: String, required: true, index: true },
    packageName: { type: String, required: true },
    version: { type: String, default: "" },
    cveId: { type: String, required: true },
    cvssScore: { type: Number, default: 0 },
    severity: { type: String, default: "Unknown" },
    source: { type: String, default: "debian-tracker-fallback" },
    detectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SupplementalVulnMatch", SupplementalVulnMatchSchema);
