const router = require("express").Router();

const Patch      = require("../models/Patch");
const Compliance = require("../models/Compliance");
const AssetMeta  = require("../models/AssetMeta");
const CVEMatch   = require("../models/CVEMatch");

// ─────────────────────────────────────────────────────────────────────────────
// RISK ENGINE v3  — CVE/CVSS Integrated
//
// Formula:
//
//   RiskScore = clamp(
//     (W_cvss × CVSSFactor + W_comp × CompFactor) × CriticalityMultiplier × 100,
//     0, 100
//   )
//
// CVSSFactor calculation:
//   If CVE data available:
//     CVSSFactor = clamp(maxCVSS / 10, 0, 1)
//     where maxCVSS = highest CVSS score among all CVEs for this asset
//     This ensures a Critical CVE (9.8) = factor 0.98, High (7.5) = 0.75
//   If no CVE data (fallback):
//     CVSSFactor = clamp(missingCount / PATCH_MAX, 0, 1)
//
// CompFactor:
//   CompFactor = clamp(failedCISChecks / COMP_MAX, 0, 1)
//
// CriticalityMultiplier = 0.5 + (criticality × 0.5)
//   Maps criticality 0.0–1.0 → multiplier 0.5–1.0
//
// Weight justification (NIST SP 800-30):
//   W_cvss = 0.60  — CVSS-scored vulnerabilities represent confirmed,
//                    quantified exploitability risk. Weighted highest
//                    as per CVSSv3.1 specification use in risk frameworks.
//   W_comp = 0.40  — CIS benchmark failures represent attack surface
//                    through misconfiguration. Slightly lower weight as
//                    not all misconfigurations are directly exploitable.
//
// Risk tiers (CVSS v3.1 qualitative scale):
//   Critical  >= 75
//   High      >= 50
//   Medium    >= 25
//   Low        < 25
// ─────────────────────────────────────────────────────────────────────────────

const W_CVSS   = 0.60;
const W_COMP   = 0.40;
const PATCH_MAX = 50;
const COMP_MAX  = 300;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function cvssToSeverity(score) {
  if (score >= 9.0) return "Critical";
  if (score >= 7.0) return "High";
  if (score >= 4.0) return "Medium";
  if (score >= 0.1) return "Low";
  return "Unknown";
}

async function computeRisk({ patch, compliance, meta, hostname }) {
  // ── Inputs ────────────────────────────────────────────────────────────────
  const missingCount = patch?.missingCount     ?? 0;
  const failedCount  = compliance?.failedCount ?? 0;
  const criticality  = meta?.criticality       ?? 0.5;
  const role         = meta?.role              ?? "workstation";

  // ── CVE data ──────────────────────────────────────────────────────────────
  let cvssMode     = "fallback";  // "cvss" or "fallback"
  let maxCVSS      = 0;
  let avgCVSS      = 0;
  let cveCount     = 0;
  let criticalCVEs = 0;
  let highCVEs     = 0;

  if (hostname) {
    const cves = await CVEMatch.find({
      assetHostname: { $regex: new RegExp(`^${hostname}$`, "i") }
    }).select("cvssScore severity");

    if (cves.length > 0) {
      cvssMode     = "cvss";
      cveCount     = cves.length;
      maxCVSS      = Math.max(...cves.map((c) => c.cvssScore || 0));
      avgCVSS      = cves.reduce((s, c) => s + (c.cvssScore || 0), 0) / cves.length;
      criticalCVEs = cves.filter((c) => c.severity === "Critical").length;
      highCVEs     = cves.filter((c) => c.severity === "High").length;
    }
  }

  // ── Factor calculation ────────────────────────────────────────────────────
  let cvssFactor;
  let cvssFactorNote;

  if (cvssMode === "cvss" && maxCVSS > 0) {
    // Use max CVSS score — worst-case exploitability
    cvssFactor     = clamp(maxCVSS / 10, 0, 1);
    cvssFactorNote = `max CVSS=${maxCVSS.toFixed(1)} (${cveCount} CVEs, ${criticalCVEs} critical, ${highCVEs} high)`;
  } else {
    // Fallback: use patch count as proxy
    cvssFactor     = clamp(missingCount / PATCH_MAX, 0, 1);
    cvssFactorNote = `no CVE data — using patch count fallback (${missingCount}/${PATCH_MAX})`;
  }

  const complianceFactor      = clamp(failedCount / COMP_MAX, 0, 1);
  const criticalityMultiplier = 0.5 + (criticality * 0.5);

  // ── Final score ───────────────────────────────────────────────────────────
  const baseRisk = (W_CVSS * cvssFactor) + (W_COMP * complianceFactor);
  const score    = clamp(Math.round(baseRisk * criticalityMultiplier * 100), 0, 100);

  // ── Risk tier ─────────────────────────────────────────────────────────────
  let priority;
  if      (score >= 75) priority = "Critical";
  else if (score >= 50) priority = "High";
  else if (score >= 25) priority = "Medium";
  else                  priority = "Low";

  // ── Explainable reasoning ─────────────────────────────────────────────────
  const reasons = [
    `Asset role: ${role} (criticality=${criticality}, multiplier=${criticalityMultiplier.toFixed(2)})`,
    `CVSS factor: ${cvssFactor.toFixed(3)} — ${cvssFactorNote} (weight ${W_CVSS})`,
    `Compliance factor: ${complianceFactor.toFixed(3)} — ${failedCount} CIS failures (weight ${W_COMP})`,
    `Base risk = (${W_CVSS} × ${cvssFactor.toFixed(3)}) + (${W_COMP} × ${complianceFactor.toFixed(3)}) = ${baseRisk.toFixed(3)}`,
    `Final score = ${baseRisk.toFixed(3)} × ${criticalityMultiplier.toFixed(2)} × 100 = ${score}`,
  ];

  // ── Structured breakdown ──────────────────────────────────────────────────
  const breakdown = {
    cvssFactor:            parseFloat(cvssFactor.toFixed(4)),
    complianceFactor:      parseFloat(complianceFactor.toFixed(4)),
    criticalityMultiplier: parseFloat(criticalityMultiplier.toFixed(4)),
    baseRisk:              parseFloat(baseRisk.toFixed(4)),
    cvssMode,
    cveStats: { cveCount, maxCVSS, avgCVSS: parseFloat(avgCVSS.toFixed(2)), criticalCVEs, highCVEs },
    weights: { cvss: W_CVSS, compliance: W_COMP },
  };

  return { score, priority, reasons, breakdown };
}

// ── GET /api/risk/latest/:hostname ────────────────────────────────────────────
router.get("/latest/:hostname", async (req, res) => {
  try {
    const hostname = req.params.hostname;

    const [patch, compliance, meta] = await Promise.all([
      Patch.findOne({ assetHostname: { $regex: new RegExp(`^${hostname}$`, "i") } }).sort({ collectedAt: -1 }),
      Compliance.findOne({ assetHostname: { $regex: new RegExp(`^${hostname}$`, "i") } }).sort({ collectedAt: -1 }),
      AssetMeta.findOne({ hostname: { $regex: new RegExp(`^${hostname}$`, "i") } }),
    ]);

    const risk = await computeRisk({ patch, compliance, meta, hostname });

    res.json({
      ok: true,
      hostname,
      risk,
      inputs: {
        missingCount:          patch?.missingCount       ?? 0,
        failedCount:           compliance?.failedCount   ?? 0,
        criticality:           meta?.criticality         ?? 0.5,
        role:                  meta?.role                ?? "workstation",
        patchCollectedAt:      patch?.collectedAt        ?? null,
        complianceCollectedAt: compliance?.collectedAt   ?? null,
        metaUpdatedAt:         meta?.updatedAt           ?? null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ── GET /api/risk/all ─────────────────────────────────────────────────────────
router.get("/all", async (req, res) => {
  try {
    const metas = await AssetMeta.find({});
    const results = [];

    for (const meta of metas) {
      const [patch, compliance] = await Promise.all([
        Patch.findOne({ assetHostname: { $regex: new RegExp(`^${meta.hostname}$`, "i") } }).sort({ collectedAt: -1 }),
        Compliance.findOne({ assetHostname: { $regex: new RegExp(`^${meta.hostname}$`, "i") } }).sort({ collectedAt: -1 }),
      ]);

      const risk = await computeRisk({ patch, compliance, meta, hostname: meta.hostname });

      results.push({
        hostname:    meta.hostname,
        role:        meta.role,
        criticality: meta.criticality,
        risk,
        inputs: {
          missingCount: patch?.missingCount     ?? 0,
          failedCount:  compliance?.failedCount ?? 0,
        },
      });
    }

    results.sort((a, b) => b.risk.score - a.risk.score);
    res.json({ ok: true, count: results.length, data: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ── GET /api/risk/cves/:hostname ──────────────────────────────────────────────
// Returns all CVEs for a specific asset — used by AssetDetails page
router.get("/cves/:hostname", async (req, res) => {
  try {
    const hostname = req.params.hostname;
    const cves = await CVEMatch.find({
      assetHostname: { $regex: new RegExp(`^${hostname}$`, "i") }
    }).sort({ cvssScore: -1 });

    res.json({ ok: true, count: cves.length, data: cves });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;