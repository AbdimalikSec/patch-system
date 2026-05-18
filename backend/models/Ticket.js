const mongoose = require("mongoose");

/**
 * Ticket — remediation ticket linked to a CIS compliance check failure.
 * Created by an analyst when they decide to act on a failed check.
 * Tracks assignment, status progression, and resolution.
 */
const TicketSchema = new mongoose.Schema(
  {
    // Which asset and check this ticket is for
    assetHostname: { type: String, required: true, index: true },
    checkId:       { type: String, required: true },
    title:         { type: String, required: true },
    remediation:   { type: String, default: "" },

    // Workflow
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved"],
      default: "open",
    },
    priority: {
      type: String,
      enum: ["Critical", "High", "Medium", "Low"],
      default: "Medium",
    },

    // People
    assignedTo: { type: String, default: "" },
    createdBy:  { type: String, default: "" },

    // Notes / audit trail
    notes: { type: String, default: "" },

    // When it was resolved
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One open ticket per check per asset — prevent duplicates
TicketSchema.index({ assetHostname: 1, checkId: 1 }, { unique: true });

module.exports = mongoose.model("Ticket", TicketSchema);