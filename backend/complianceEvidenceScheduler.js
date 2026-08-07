const ComplianceEvidence = require("./models/ComplianceEvidence");
const { createNotification } = require("./utils/notify");

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day — expiry dates don't move fast
const WARNING_WINDOW_DAYS = 30;

async function checkExpiringEvidence() {
  try {
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const expiring = await ComplianceEvidence.find({
      supersededBy: null,
      expiresAt: { $ne: null, $lte: warningCutoff },
      expiryNotifiedAt: null,
    }).lean();

    for (const record of expiring) {
      const isAlreadyExpired = new Date(record.expiresAt) < now;
      createNotification({
        type: isAlreadyExpired ? "evidence_expired" : "evidence_expiring_soon",
        severity: isAlreadyExpired ? "critical" : "warning",
        title: isAlreadyExpired ? "Compliance evidence has expired" : "Compliance evidence expiring soon",
        message: `${record.originalFileName} (control ${record.controlId}) ${isAlreadyExpired ? "expired on" : "expires on"} ${new Date(record.expiresAt).toLocaleDateString()}`,
        targetRoles: ["compliance-officer", "admin"],
      });

      await ComplianceEvidence.findByIdAndUpdate(record._id, { expiryNotifiedAt: now });
    }

    if (expiring.length > 0) {
      console.log(`[complianceEvidenceScheduler] sent ${expiring.length} expiry notification(s)`);
    }
  } catch (e) {
    console.error("[complianceEvidenceScheduler] check failed:", e.message);
  }
}

function startComplianceEvidenceScheduler() {
  console.log("[complianceEvidenceScheduler] started, checking daily");
  setInterval(checkExpiringEvidence, CHECK_INTERVAL_MS);
}

module.exports = { startComplianceEvidenceScheduler };
