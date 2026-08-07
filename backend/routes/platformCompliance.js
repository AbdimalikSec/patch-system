const router = require("express").Router();
const PlatformVulnerability = require("../models/PlatformVulnerability");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

// GET /api/platform-compliance — evidence of Triarch's OWN security posture
// as software: RBAC enforcement, activity logging, credential hashing, and
// its own dependency vulnerability status. Read access matches Compliance
// view permissions (admin, compliance-officer, analyst, auditor).
router.get(
  "/",
  requireAuth,
  requireRole("admin", "compliance-officer", "analyst", "auditor"),
  async (req, res) => {
    try {
      const roleCount = await User.distinct("role");
      const activityCount = await UserActivity.countDocuments({});
      const oldestActivity = await UserActivity.findOne({}).sort({ createdAt: 1 }).lean();

      const activeDependencyVulns = await PlatformVulnerability.find({ resolvedAt: null })
        .sort({ severity: -1 })
        .lean();

      const severityCounts = { critical: 0, high: 0, moderate: 0, low: 0 };
      for (const v of activeDependencyVulns) {
        if (severityCounts[v.severity] !== undefined) severityCounts[v.severity]++;
      }

      res.json({
        ok: true,
        data: {
          accessControl: {
            control: "ISO/IEC 27001:2022 A.5.15 — Access Control",
            evidence: `${roleCount.length}-role access model enforced at the backend route level (not just hidden in the UI)`,
            roles: roleCount,
          },
          auditLogging: {
            control: "ISO/IEC 27001:2022 A.8.15 — Logging",
            evidence: `${activityCount} recorded activity events`,
            since: oldestActivity?.createdAt || null,
          },
          credentialStorage: {
            control: "ISO/IEC 27001:2022 A.5.17 — Authentication Information",
            evidence: "Passwords stored using bcrypt hashing; never stored or transmitted in plain text",
          },
          dependencyVulnerabilities: {
            control: "ISO/IEC 27001:2022 A.8.8 — Management of Technical Vulnerabilities",
            evidence: "Backend npm dependencies audited daily via npm audit",
            severityCounts,
            active: activeDependencyVulns,
          },
        },
      });
    } catch (e) {
      console.error("[platform-compliance]", e.message);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  },
);

module.exports = router;
