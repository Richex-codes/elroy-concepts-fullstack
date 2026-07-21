const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      // e.g. "sale.created", "sale.deleted", "inventory.quantity_edited",
      // "inventory.restocked", "debtor.cleared"
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: String,
    actorEmail: String,

    targetType: { type: String, required: true }, // "Sale", "Product", etc.
    targetId: { type: mongoose.Schema.Types.ObjectId },

    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,

    // Optional idempotency key (e.g. "logout:<jti>") -- lets a caller make an
    // audit event safe to log more than once (retries, concurrent requests)
    // without producing duplicate entries. Sparse so actions that don't set
    // one don't collide on a shared `undefined` value.
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ actorId: 1 });
AuditLogSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
