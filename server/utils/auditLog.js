const AuditLog = require("../models/auditLogModel");

/**
 * Writes a permanent audit trail entry. No route in the app ever edits or
 * deletes these — they are the tamper-proof record of who did what.
 *
 * Never throws: a logging failure must not block the real operation it's
 * describing, so errors are swallowed (and reported to console) here.
 */
async function logAudit({ action, actor, targetType, targetId, before, after, metadata, dedupeKey }) {
  try {
    await AuditLog.create({
      action,
      actorId: actor?.id,
      actorName: actor?.name,
      actorEmail: actor?.email,
      targetType,
      targetId,
      before,
      after,
      metadata,
      dedupeKey,
    });
  } catch (err) {
    // Duplicate dedupeKey means this exact event was already logged (e.g. a
    // retried or concurrent request) -- that's the idempotency working as
    // intended, not a failure.
    if (err?.code === 11000) return;
    console.error("Failed to write audit log entry:", err);
  }
}

module.exports = { logAudit };
