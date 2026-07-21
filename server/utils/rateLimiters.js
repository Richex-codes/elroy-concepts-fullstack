const rateLimit = require("express-rate-limit");

// Login had zero brute-force protection -- unlimited password guesses
// against any account. 10 attempts per 15 minutes per IP is generous for a
// real user who mistypes a password a few times, while making automated
// credential-stuffing/guessing impractical.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { msg: "Too many login attempts. Please wait a few minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Lighter IP-based throttle for the account-recovery endpoints. Each of
// these already has its own per-account 60s cooldown, but that doesn't stop
// one IP from hammering many *different* emails -- this is the
// complementary defense-in-depth layer.
const accountActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { msg: "Too many requests. Please wait a few minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, accountActionLimiter };
