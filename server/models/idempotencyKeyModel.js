const mongoose = require("mongoose");

// Records the outcome of a request keyed by the client-supplied
// Idempotency-Key header, scoped per endpoint. Lets a retried request
// (double-click that slips through, flaky network, resubmission after a
// lost response) replay the original response instead of re-running the
// side effects -- creating a second sale, double-deducting stock, etc.
const IdempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    // True while the original request is still being processed -- lets a
    // concurrent duplicate (same key, arriving before the first finishes)
    // be told to wait instead of racing the real handler.
    pending: { type: Boolean, default: true },
    statusCode: { type: Number },
    response: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

// Keys only need to survive long enough to catch a retry of the same user
// action, not forever -- TTL cleans them up automatically.
IdempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.model("IdempotencyKey", IdempotencyKeySchema);
