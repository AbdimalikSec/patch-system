/**
 * collectors_cve_enrichment.js
 *
 * Queries vulnerability databases for each asset's missing patches/packages
 * and stores matched CVEs with CVSS scores in the CVEMatch collection.
 *
 * Sources:
 *   Windows KB numbers → Microsoft MSRC API (free, no auth)
 *   Linux packages     → Debian Security Tracker JSON API (free, no auth)
 *
 * Exploit Intelligence:
 *   cve.circl.lu API → checks each CVE for known public exploits
 *   (Metasploit modules, ExploitDB entries, etc.)
 *
 * Run manually:
 *   node collectors_cve_enrichment.js
 */

require("dotenv").config();
const fs       = require("fs");
const path     = require("path");
const mongoose = require("mongoose");
const https    = require("https");

const Patch    = require("./models/Patch");
const CVEMatch = require("./models/CVEMatch");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/riskpatchdb";

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { "User-Agent": "RiskPatchSystem/1.0", "Accept": "application/json", ...headers },
    };
    https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    }).on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Exploit Intelligence — cve.circl.lu ──────────────────────────────────────
// Free API, no auth required. Returns exploit references for a CVE.
// Rate limit: be gentle, 1 request per second max.
async function checkExploitIntelligence(cveId) {
  try {
    const url    = `https://cve.circl.lu/api/cve/${cveId}`;
    const result = await httpsGet(url);

    if (!result.body || result.status !== 200) return { hasExploit: false, refs: [] };

    const data = result.body;
    const refs = [];

    // Check for exploit references in the CVE data
    // circl.lu includes refmap which lists exploit-db, metasploit references
    if (data.refmap) {
      if (data.refmap.exploit && Array.isArray(data.refmap.exploit)) {
        for (const e of data.refmap.exploit) {
          refs.push(`ExploitDB: ${e}`);
        }
      }
      if (data.refmap.metasploit && Array.isArray(data.refmap.metasploit)) {
        for (const m of data.refmap.metasploit) {
          refs.push(`Metasploit: ${m}`);
        }
      }
    }

    // Also check references array for exploit-db.com links
    if (data.references && Array.isArray(data.references)) {
      for (const ref of data.references) {
        if (typeof ref === "string" && ref.includes("exploit-db.com")) {
          if (!refs.some(r => r.includes(ref))) {
            refs.push(`ExploitDB: ${ref}`);
          }
        }
        if (typeof ref === "string" && ref.includes("exploit") && ref.includes("metasploit")) {
          if (!refs.some(r => r.includes(ref))) {
            refs.push(`Metasploit: ${ref}`);
          }
        }
      }
    }

    return { hasExploit: refs.length > 0, refs };
  } catch (e) {
    // If API is unreachable, skip silently
    return { hasExploit: false, refs: [] };
  }
}

// ── WINDOWS — Microsoft MSRC API ─────────────────────────────────────────────
async function msrcGetCVEsForKB(kb) {
  const kbNum = kb.replace(/^KB/i, "");
  try {
    const searchUrl = `https://api.msrc.microsoft.com/sug/v2.0/en-US/affectedProduct?$filter=kbArticles/any(kb:kb/articleName eq '${kbNum}')&$top=10`;
    const result    = await httpsGet(searchUrl, { "Accept": "application/json" });

    if (!result.body || !result.body.value || result.body.value.length === 0) return [];

    const cves = [];
    for (const item of result.body.value) {
      const cveId = item.cveNumber || item.cveId || null;
      if (!cveId || !cveId.startsWith("CVE-")) continue;

      let cvssScore = 0;
      let cvssVector = "";

      if (item.baseScore)    cvssScore = parseFloat(item.baseScore) || 0;
      if (item.temporalScore) cvssScore = Math.max(cvssScore, parseFloat(item.temporalScore) || 0);
      if (item.vectorString)  cvssVector = item.vectorString;

      let severity = cvssToSeverity(cvssScore);
      if (cvssScore === 0 && item.severity) {
        severity  = item.severity;
        cvssScore = severityToCVSS(item.severity);
      }

      cves.push({ cveId, cvssScore, cvssVector, severity, description: item.tag || item.productName || "", source: "msrc" });
    }
    return cves;
  } catch (e) {
    console.warn(`  [!] MSRC lookup failed for ${kb}: ${e.message}`);
    return [];
  }
}

// ── LINUX — Debian Security Tracker ──────────────────────────────────────────
let debianCVECache = null;

async function loadDebianCVEData() {
  if (debianCVECache) return debianCVECache;
  const LOCAL_PATH = path.join(__dirname, "debian_cve_db.json");
  console.log("[*] Loading Debian CVE database from local file...");
  try {
    const raw  = fs.readFileSync(LOCAL_PATH, "utf8");
    debianCVECache = JSON.parse(raw);
    console.log(`[+] Debian CVE database loaded: ${Object.keys(debianCVECache).length} packages indexed`);
    return debianCVECache;
  } catch (e) {
    console.warn("[!] Failed to read local Debian CVE file:", e.message);
    return null;
  }
}

async function debianGetCVEsForPackage(packageName, cveDb) {
  if (!cveDb) return [];
  const pkgBase = packageName.split("/")[0].split(":")[0].toLowerCase().trim();
  const pkgData = cveDb[pkgBase];
  if (!pkgData) return [];

  const cves = [];
  for (const [cveId, cveInfo] of Object.entries(pkgData)) {
    if (!cveId.startsWith("CVE-")) continue;

    let status = "unknown", urgency = "unknown", description = "";
    for (const release of ["bookworm", "trixie", "bullseye", "buster"]) {
      if (cveInfo[release]) {
        status      = cveInfo[release].status  || "unknown";
        urgency     = cveInfo[release].urgency || "unknown";
        description = cveInfo.description || "";
        break;
      }
    }
    if (status === "resolved") continue;

    const cvssScore = debianUrgencyToCVSS(urgency);
    const severity  = cvssToSeverity(cvssScore);
    cves.push({ cveId, cvssScore, cvssVector: "", severity, description: description.slice(0, 300), source: "debian" });
  }
  return cves;
}

// ── Severity helpers ──────────────────────────────────────────────────────────
function cvssToSeverity(score) {
  if (score >= 9.0) return "Critical";
  if (score >= 7.0) return "High";
  if (score >= 4.0) return "Medium";
  if (score >= 0.1) return "Low";
  return "Unknown";
}

function severityToCVSS(severity) {
  switch ((severity || "").toLowerCase()) {
    case "critical":  return 9.5;
    case "important": return 7.5;
    case "high":      return 7.5;
    case "moderate":  return 5.0;
    case "medium":    return 5.0;
    case "low":       return 2.0;
    default:          return 5.0;
  }
}

function debianUrgencyToCVSS(urgency) {
  switch ((urgency || "").toLowerCase()) {
    case "high":        return 8.0;
    case "medium":      return 5.5;
    case "low":         return 2.5;
    case "unimportant": return 1.0;
    case "end-of-life": return 7.0;
    default:            return 5.0;
  }
}

// ── Main enrichment ───────────────────────────────────────────────────────────
async function enrichAsset(patch, debianDb) {
  const hostname = patch.assetHostname;
  const os       = patch.os;
  const missing  = patch.missing || [];

  // Clear stale CVE records for this asset before re-enriching — prevents
  // accumulation of CVE matches for patches that are no longer missing.
  const deleted = await CVEMatch.deleteMany({ assetHostname: hostname });
  if (deleted.deletedCount > 0) {
    console.log(`  [~] ${hostname}: cleared ${deleted.deletedCount} stale CVE record(s)`);
  }

  if (missing.length === 0) {
    console.log(`  [~] ${hostname}: no missing patches to enrich`);
    return { matched: 0, stored: 0, exploits: 0 };
  }
  console.log(`  [*] ${hostname} (${os}): enriching ${missing.length} missing patches...`);
  let matched = 0, stored = 0, exploits = 0;

  for (const patchRef of missing) {
    let cves = [];

    if (os === "windows") {
      cves = await msrcGetCVEsForKB(patchRef);
      await sleep(300);
    } else if (os === "linux") {
      cves = await debianGetCVEsForPackage(patchRef, debianDb);
    }

    if (cves.length === 0) continue;
    matched++;

    const details    = patch.raw?.missingDetails || [];
    const detail     = details.find((d) => d.kb === patchRef || d.name === patchRef);
    const patchTitle = detail?.title || patchRef;

    for (const cve of cves) {
      // Check exploit intelligence for this CVE
      const { hasExploit, refs: exploitRefs } = await checkExploitIntelligence(cve.cveId);
      await sleep(1000); // Respect circl.lu rate limit

      if (hasExploit) {
        exploits++;
        console.log(`    🔥 ${cve.cveId}: PUBLIC EXPLOIT FOUND (${exploitRefs.length} reference${exploitRefs.length > 1 ? "s" : ""})`);
      }

      try {
        await CVEMatch.findOneAndUpdate(
          { assetHostname: hostname, patchRef, cveId: cve.cveId },
          {
            assetHostname: hostname, os, patchRef, patchTitle,
            cveId:       cve.cveId,
            cvssScore:   cve.cvssScore,
            cvssVector:  cve.cvssVector,
            severity:    cve.severity,
            description: cve.description,
            source:      cve.source,
            hasExploit,
            exploitRefs,
            collectedAt: new Date(),
          },
          { upsert: true, returnDocument: "after" }
        );
        stored++;
      } catch (e) {
        if (e.code !== 11000) console.warn(`    [!] DB error for ${cve.cveId}:`, e.message);
      }
    }

    console.log(`    [+] ${patchRef}: ${cves.length} CVEs found`);
  }

  return { matched, stored, exploits };
}

(async () => {
  try {
    console.log("[*] Connecting to MongoDB:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("[+] Connected.\n");

    const debianDb = await loadDebianCVEData();
    console.log("");

    const patches = await Patch.aggregate([
      { $sort: { collectedAt: -1 } },
      { $group: { _id: "$assetHostname", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
    ]);

    console.log(`[*] Processing ${patches.length} assets...\n`);

    let totalMatched = 0, totalStored = 0, totalExploits = 0;

    for (const patch of patches) {
      const { matched, stored, exploits } = await enrichAsset(patch, debianDb);
      totalMatched  += matched;
      totalStored   += stored;
      totalExploits += exploits;
      console.log(`  [✓] ${patch.assetHostname}: ${matched} patches matched, ${stored} CVEs stored, ${exploits} with public exploits\n`);
    }

    console.log("─".repeat(50));
    console.log(`[+] CVE enrichment complete`);
    console.log(`    Patches matched to CVEs : ${totalMatched}`);
    console.log(`    CVE records stored      : ${totalStored}`);
    console.log(`    CVEs with public exploits: ${totalExploits}`);
    console.log("");

    const exploitCount = await CVEMatch.countDocuments({ hasExploit: true });
    console.log(`[!] Total CVEs with known exploits in DB: ${exploitCount}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error("[!] Fatal error:", e.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();
