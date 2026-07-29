const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // e.g. "ticket_assigned", "login_bruteforce"
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    title: { type: String, required: true },
    message: { type: String, required: true },

    // Targeting — a notification goes to EITHER a specific user OR a set of roles,
    // never neither (enforced in the helper, not here, to keep the schema simple).
    targetRoles: { type: [String], default: [] },
    targetUsername: { type: String, default: "" },

    // Optional context links, so the frontend can deep-link to the relevant page
    relatedHostname: { type: String, default: "" },
    relatedTicketId: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", default: null },

    // Per-user read tracking — needed because a role-targeted notification is
    // shared by many people, each of whom reads it independently.
    readBy: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Fast lookups for "what's visible to this user" queries
NotificationSchema.index({ targetUsername: 1, createdAt: -1 });
NotificationSchema.index({ targetRoles: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
