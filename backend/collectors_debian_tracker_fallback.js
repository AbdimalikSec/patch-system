const axios = require("axios");
const https = require("https");
const mongoose = require("mongoose");
const SupplementalVulnMatch = require("./models/SupplementalVulnMatch");
const { loadDebianCVEData, debianGetCVEsForPackage } = require("./collectors_cve_enrichment.js");

const WAZUH_INDEXER_URL = process.env.WAZUH_INDEXER_URL || "https://192.168.0.20:9200";
const WAZUH_INDEXER_USER = process.env.WAZUH_INDEXER_USER || "admin";
const WAZUH_INDEXER_PASS = process.env.WAZUH_INDEXER_PASS || "";

// Agents whose OS Wazuh's own vulnerability-detection engine does not
// currently cover (confirmed empirically — real package inventory exists,
// zero vulnerability hits ever produced). Extend this list if another
// agent shows the same pattern.
const FALLBACK_HOSTNAMES = ["kali"];

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function fetchInstalledDebPackages(hostname) {
  const res = await axios.post(
    `${WAZUH_INDEXER_URL}/wazuh-states-inventory-packages-wazuh/_search`,
    {
      query: { bool: { must: [{ match: { "agent.name": hostname } }, { match: { "package.type": "deb" } }] } },
      size: 10000,
      _source: ["package.name", "package.version"],
    },
    {
      auth: { username: WAZUH_INDEXER_USER, password: WAZUH_INDEXER_PASS },
      httpsAgent,
    },
  );
  return (res.data?.hits?.hits || []).map((h) => ({
    name: h._source?.package?.name,
    version: h._source?.package?.version,
  })).filter((p) => p.name);
}

async function runDebianTrackerFallback() {
  console.log("[debianTrackerFallback] starting run for:", FALLBACK_HOSTNAMES.join(", "));

  const debianDb = await loadDebianCVEData();
  if (!debianDb) {
    console.error("[debianTrackerFallback] Debian CVE database unavailable — aborting run");
    return;
  }

  for (const hostname of FALLBACK_HOSTNAMES) {
    try {
      const packages = await fetchInstalledDebPackages(hostname);
      console.log(`[debianTrackerFallback] ${hostname}: ${packages.length} deb packages to check`);

      const matches = [];
      for (const pkg of packages) {
        const cves = await debianGetCVEsForPackage(pkg.name, debianDb);
        for (const cve of cves) {
          matches.push({
            hostname,
            packageName: pkg.name,
            version: pkg.version || "",
            cveId: cve.cveId,
            cvssScore: cve.cvssScore,
            severity: cve.severity,
            source: "debian-tracker-fallback",
          });
        }
      }

      // Replace this hostname's supplemental matches wholesale each run —
      // simpler and safer than diffing individual CVEs, and this collector
      // runs infrequently (daily), so the cost is trivial.
      await SupplementalVulnMatch.deleteMany({ hostname });
      if (matches.length > 0) {
        await SupplementalVulnMatch.insertMany(matches);
      }

      console.log(`[debianTrackerFallback] ${hostname}: ${matches.length} CVE match(es) recorded`);
    } catch (e) {
      console.error(`[debianTrackerFallback] failed for ${hostname}:`, e.message);
    }
  }
}

module.exports = { runDebianTrackerFallback };

// Allow running standalone: `node collectors_debian_tracker_fallback.js`
if (require.main === module) {
  require("dotenv").config();
  mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/riskpatchdb")
    .then(() => runDebianTrackerFallback())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
