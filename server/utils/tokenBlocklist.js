// Logging out only ever discarded the token client-side -- the JWT itself
// stayed valid server-side for its full remaining lifetime, so "logout" on
// a lost/stolen device did nothing. This makes logout actually revoke the
// token: its jti is recorded here until the token would have expired
// naturally anyway (a still-valid entry beyond that point would be dead
// weight, since expiration alone would reject the token by then).
const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error("Token blocklist Redis error:", err.message));

const PREFIX = "blocklist:jti:";

async function blocklistToken(jti, expUnixSeconds) {
  if (!jti) return; // pre-migration tokens without a jti can't be individually revoked
  const ttl = expUnixSeconds - Math.floor(Date.now() / 1000);
  if (ttl <= 0) return; // already expired, nothing left to revoke
  await redis.set(PREFIX + jti, "1", "EX", ttl);
}

// Fails open (treats a lookup error as "not blocklisted") the same way
// utils/idempotency.js does -- Redis hiccuping shouldn't lock every admin
// out of a live production system.
async function isTokenBlocklisted(jti) {
  if (!jti) return false;
  try {
    return (await redis.exists(PREFIX + jti)) === 1;
  } catch (err) {
    console.error("Token blocklist check failed:", err.message);
    return false;
  }
}

module.exports = { blocklistToken, isTokenBlocklisted };
