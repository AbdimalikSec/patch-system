const Notification = require("../models/Notification");

/**
 * createNotification — the single entry point every detection point in the
 * codebase calls when one of the known event types occurs. Callers never
 * touch the Notification model directly, so the targeting rules (role vs.
 * specific user) stay consistent no matter where an event is detected from.
 *
 * Exactly one of targetRoles / targetUsername should be provided.
 */
async function createNotification({
  type,
  severity = "info",
  title,
  message,
  targetRoles = [],
  targetUsername = "",
  relatedHostname = "",
  relatedTicketId = null,
}) {
  try {
    if (!type || !title || !message) {
      console.error("[notify] missing required fields", { type, title, message });
      return null;
    }
    if (targetRoles.length === 0 && !targetUsername) {
      console.error("[notify] notification has no target (no roles, no username)", { type, title });
      return null;
    }
    return await Notification.create({
      type,
      severity,
      title,
      message,
      targetRoles,
      targetUsername,
      relatedHostname,
      relatedTicketId,
    });
  } catch (e) {
    // A failure to create a notification should never break the calling
    // route/collector — it's a side effect, not the primary operation.
    console.error("[notify] failed to create notification:", e.message);
    return null;
  }
}

module.exports = { createNotification };
