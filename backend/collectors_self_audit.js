const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const path = require("path");
const PlatformVulnerability = require("./models/PlatformVulnerability");

/**
 * Runs `npm audit --json` against this backend's own package.json/lock file
 * and syncs the results into PlatformVulnerability. This is Triarch
 * auditing its own software supply chain, independent of any monitored
 * machine's OS patch status.
 */
async function runSelfAudit() {
  console.log("[selfAudit] running npm audit against backend dependencies...");

  let output;
  try {
    // npm audit exits non-zero when vulnerabilities are found — that's
    // expected, not a failure. The JSON is still on stdout either way.
    // Using the async exec() here (not execSync) is deliberate: execSync
    // blocks Node's entire event loop until the process finishes, which on
    // a slow or unreliable network connection can freeze every other
    // request the server is handling — including login — for as long as
    // npm audit takes to reach the registry and respond. A timeout is also
    // set so a genuinely stuck npm process can't hang this indefinitely.
    const result = await execAsync("npm audit --json", {
      cwd: path.join(__dirname),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60000, // 60 seconds — if npm hasn't responded by then, give up cleanly
    });
    output = result.stdout;
  } catch (e) {
    output = e.stdout ? e.stdout.toString() : null;
    if (!output) {
      console.error("[selfAudit] npm audit failed or timed out:", e.message);
    }
  }

  if (!output) {
    console.error("[selfAudit] npm audit produced no output");
    return;
  }

  let data;
  try {
    data = JSON.parse(output);
  } catch (e) {
    console.error("[selfAudit] failed to parse npm audit output:", e.message);
    return;
  }

  const vulnerabilities = data.vulnerabilities || {};
  const seenKeys = new Set();

  for (const [packageName, info] of Object.entries(vulnerabilities)) {
    // `via` mixes plain dependency-name strings (indirect references) with
    // actual advisory objects — only the objects carry real advisory detail.
    const advisories = (info.via || []).filter((v) => typeof v === "object");

    if (advisories.length === 0) {
      // No specific advisory object available — still record the package
      // at its reported severity so it isn't silently dropped.
      const key = `${packageName}::general`;
      seenKeys.add(key);
      await PlatformVulnerability.findOneAndUpdate(
        { packageName, advisoryTitle: "" },
        {
          $set: {
            severity: info.severity,
            range: info.range || "",
            fixAvailable: info.fixAvailable ?? false,
            resolvedAt: null,
          },
          $setOnInsert: { detectedAt: new Date() },
        },
        { upsert: true },
      );
      continue;
    }

    for (const advisory of advisories) {
      const title = advisory.title || "Unknown advisory";
      const key = `${packageName}::${title}`;
      seenKeys.add(key);
      await PlatformVulnerability.findOneAndUpdate(
        { packageName, advisoryTitle: title },
        {
          $set: {
            severity: advisory.severity || info.severity,
            advisoryUrl: advisory.url || "",
            range: info.range || "",
            fixAvailable: info.fixAvailable ?? false,
            resolvedAt: null,
          },
          $setOnInsert: { detectedAt: new Date() },
        },
        { upsert: true },
      );
    }
  }

  // Anything previously recorded but not seen in this run has been fixed —
  // mark it resolved rather than deleting it, so there's a real history.
  const active = await PlatformVulnerability.find({ resolvedAt: null }).lean();
  for (const record of active) {
    const key = `${record.packageName}::${record.advisoryTitle || "general"}`;
    if (!seenKeys.has(key)) {
      await PlatformVulnerability.findByIdAndUpdate(record._id, { resolvedAt: new Date() });
    }
  }

  console.log(`[selfAudit] complete — ${seenKeys.size} active advisory record(s)`);
}

module.exports = { runSelfAudit };

// Allow running standalone: `node collectors_self_audit.js`
if (require.main === module) {
  const mongoose = require("mongoose");
  require("dotenv").config();
  mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/riskpatchdb")
    .then(() => runSelfAudit())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
