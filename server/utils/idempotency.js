const IdempotencyKey = require("../models/idempotencyKeyModel");

// Wrap a mutating route with this so a retried request (double-click that
// slips past the disabled-button guard, a network timeout the client
// resubmits after, a lost response) can't re-run the underlying side
// effect a second time. Opt-in per request: if the caller doesn't send an
// `Idempotency-Key` header, the request just runs unprotected as before --
// this never breaks a caller that hasn't been updated to send one yet.
//
// - No key present -> pass through untouched.
// - New key -> claim it, run the handler, cache the response IF it
//   succeeded (2xx). A real failure (bad input, insufficient stock, etc.)
//   clears the claim instead of caching it, so a corrected resubmission
//   under the same key actually re-runs rather than replaying a stale error.
// - Key already resolved -> replay the original response, no re-execution.
// - Key still in flight (a concurrent duplicate) -> 409, ask the client to
//   wait rather than racing the first request.
function idempotent(scope) {
  return async (req, res, next) => {
    const rawKey = req.header("Idempotency-Key");
    if (!rawKey) return next();

    // Bound to the requesting user (when authenticated) so a key collision
    // -- coincidental, or a client deliberately reusing/guessing one --
    // can never replay one user's cached response back to a different user.
    const fullKey = `${scope}:${req.user?.id || "anon"}:${rawKey}`;

    try {
      await IdempotencyKey.create({ key: fullKey });
    } catch (err) {
      if (err.code === 11000) {
        const existing = await IdempotencyKey.findOne({ key: fullKey }).lean();
        if (existing && !existing.pending) {
          return res.status(existing.statusCode).json(existing.response);
        }
        return res.status(409).json({
          message: "This request is already being processed. Please wait a moment before retrying.",
        });
      }
      console.error("Idempotency check failed:", err.message);
      return next(); // fail open -- infra trouble here shouldn't block the real request
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        IdempotencyKey.updateOne(
          { key: fullKey },
          { statusCode: res.statusCode, response: body, pending: false }
        ).catch((err) => console.error("Idempotency save failed:", err.message));
      } else {
        IdempotencyKey.deleteOne({ key: fullKey }).catch((err) =>
          console.error("Idempotency cleanup failed:", err.message)
        );
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = { idempotent };
