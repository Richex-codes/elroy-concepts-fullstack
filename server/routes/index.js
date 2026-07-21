require("dotenv").config();
const express = require("express");
const User = require("../models/usersModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const validator = require("validator");
const router = express.Router();
const Enquiry = require("../models/enquiriesModel");
const { enquiryQueue } = require("../jobs/queue");
const { sendActionEmail } = require("../utils/sendActionEmail");
const { logAudit } = require("../utils/auditLog");
const { notifySuperAdmins } = require("../utils/pushNotify");
const { idempotent } = require("../utils/idempotency");
const { loginLimiter, accountActionLimiter } = require("../utils/rateLimiters");

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";



// Middleware for authentication
const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    console.log("No token provided");
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  const token = authHeader.replace("Bearer", "").trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    res.status(401).json({ msg: "Invalid token" });
  }
};

// user registration
router.post("/register", accountActionLimiter, async (req, res) => {
  const { name, email, password, confirmPassword, phoneNumber, adminRequested } = req.body;

  // Validation checks
  if (!name || !email || !password || !confirmPassword || !phoneNumber)
    return res.status(400).json({ msg: "Please fill in all fields" });

  if (!validator.isEmail(email))
    return res.status(400).json({ msg: "Invalid email address" });

  if (password !== confirmPassword)
    return res.status(400).json({ msg: "Passwords do not match" });

  if (password.length < 6)
    return res
      .status(400)
      .json({ msg: "Password must be at least 6 characters" });

  if (!validator.isMobilePhone(phoneNumber, "any"))
    return res.status(400).json({ msg: "Invalid phone number" });

  // Normalize so "Test@X.com" and "test@x.com" are treated as the same
  // mailbox -- otherwise casing differences alone would let a duplicate
  // account through both this check and the DB's unique index.
  const normalizedEmail = email.trim().toLowerCase();

  // Check if user already exists
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(401).json({ msg: "User already exists" });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate crypto token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  const newUser = new User({
    name,
    email: normalizedEmail,
    password: hashedPassword,
    phoneNumber,
    verificationToken,
    verificationTokenExpiry,
    adminRequested: adminRequested === true,
  });

  try {
    const savedUser = await newUser.save();

    const verificationLink = `${CLIENT_URL}/verify-email/${verificationToken}`;

    await sendActionEmail(savedUser.email, {
      subject: "Verify your email - Elroy Concepts",
      heading: "Verify your email",
      bodyLines: [
        `Hi ${savedUser.name || "there"},`,
        "Thanks for signing up with Elroy Concepts. Please confirm your email address to activate your account.",
      ],
      buttonText: "Verify Email",
      buttonUrl: verificationLink,
      footerNote: "This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
    });
    savedUser.lastVerificationSentAt = new Date();
    await savedUser.save();

    res
      .status(201)
      .json({ msg: "Registered successfully. Please verify your email." });
  } catch (err) {
    // Two near-simultaneous signups with the same email can both pass the
    // findOne check above before either saves -- the DB's unique index is
    // the real backstop here, and reports the clash as this duplicate-key
    // error rather than a generic failure.
    if (err.code === 11000) {
      return res.status(401).json({ msg: "User already exists" });
    }
    console.error("Error saving user:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/verify-email/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired token" });
    }

    if (user.isVerified) {
      return res.status(200).json({ msg: "Email already verified" });
    }

    if (user.verificationTokenExpiry < Date.now()) {
      return res.status(400).json({ msg: "Token expired" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;
    await user.save();

    res.status(200).json({ msg: "Email verified successfully" });
  } catch (error) {
    console.error("Email verification error:", error.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Resend the verification email with a fresh token -- reachable from the
// signup success screen, and from the login page when login fails with
// "Please verify your email".
router.post("/resend-verification", accountActionLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ msg: "Please provide a valid email address" });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ msg: "No account found with that email." });
    }
    if (user.isVerified) {
      return res.status(400).json({ msg: "This email is already verified. Please log in." });
    }

    // Same cooldown purpose as forgot-password's -- the client already
    // hides the resend button for 60s, this is the real enforcement.
    if (user.lastVerificationSentAt && Date.now() - user.lastVerificationSentAt.getTime() < 60 * 1000) {
      return res.status(429).json({ msg: "Please wait a moment before requesting another verification email." });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = verificationToken;
    user.verificationTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
    user.lastVerificationSentAt = new Date();
    await user.save();

    const verificationLink = `${CLIENT_URL}/verify-email/${verificationToken}`;
    await sendActionEmail(user.email, {
      subject: "Verify your email - Elroy Concepts",
      heading: "Verify your email",
      bodyLines: [
        `Hi ${user.name || "there"},`,
        "Here's a fresh verification link. Please confirm your email address to activate your account.",
      ],
      buttonText: "Verify Email",
      buttonUrl: verificationLink,
      footerNote: "This link expires in 24 hours. If you didn't request this, you can safely ignore this email.",
    });

    res.status(200).json({ msg: "Verification email sent. Please check your inbox (and spam folder)." });
  } catch (err) {
    console.error("Resend verification error:", err.message);
    res.status(500).json({ msg: "Failed to resend verification email" });
  }
});

// handle login
router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  // check if user exist
  try {
    const user = await User.findOne({ email: email?.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }
    if (!user.isVerified) {
      return res.status(401).json({ msg: "Please verify your email" });
    }

    // The customer storefront isn't live yet -- only accounts already
    // promoted to admin/superadmin can actually sign in. Anyone still on
    // the default "customer" role gets a tailored holding message instead:
    // one for genuine customers, a different one for people who checked
    // "I am a business admin" at signup but haven't been assigned a role
    // yet, so they know to follow up with their superadmin rather than
    // assuming their account is broken.
    if (user.role === "customer") {
      if (user.adminRequested) {
        return res.status(403).json({
          msg: "Your admin access request is still pending. Please reach out to your super admin so they can assign you a role.",
        });
      }
      return res.status(403).json({
        msg: "We're putting the finishing touches on our online store. Thank you for your patience -- we'll be up and running soon!",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        isAdmin: user.isAdmin,
        role: user.role,
        adminBranches: user.adminBranches,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        jti: crypto.randomUUID(),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "5h",
      }
    );

    await logAudit({
      action: "user.logged_in",
      actor: { id: user._id, name: user.name, email: user.email },
      targetType: "User",
      targetId: user._id,
    });

    res.status(200).json({ token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ msg: "error logging In" });
  }
});

// handle logout -- the client just discards its token, so this is the only
// place a logout event can be recorded server-side for the audit trail.
// Expiration is intentionally not enforced here (signature still is) so a
// session-timeout logout -- where the token has already expired by the time
// the client reports it -- can still be attributed to the right user.
router.post("/logout", async (req, res) => {
  const authHeader = req.header("Authorization");
  const token = authHeader ? authHeader.replace("Bearer", "").trim() : null;
  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      ignoreExpiration: true,
    });
    const reason = req.body?.reason === "timeout" ? "timeout" : "manual";

    // One logout event per token, no matter how many times this route is
    // hit for it (e.g. several requests 401-ing at once on timeout) --
    // dedupeKey is unique per token, so repeat calls just no-op.
    const tokenKey = decoded.jti || `${decoded.id}:${decoded.iat}`;

    await logAudit({
      action: reason === "timeout" ? "user.session_timeout" : "user.logged_out",
      actor: decoded,
      targetType: "User",
      targetId: decoded.id,
      metadata: { reason },
      dedupeKey: `logout:${tokenKey}`,
    });

    res.status(200).json({ msg: "Logged out" });
  } catch (err) {
    console.error("Logout audit failed:", err.message);
    res.status(401).json({ msg: "Invalid token" });
  }
});

router.put("/profile", authMiddleware, async (req, res) => {
  const { name, phoneNumber, oldPassword, newPassword, confirmPassword } =
    req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Update basic info
    user.name = name || user.name;
    user.phoneNumber = phoneNumber || user.phoneNumber;

    // If password change is requested
    if (oldPassword || newPassword || confirmPassword) {
      if (!oldPassword || !newPassword || !confirmPassword) {
        return res
          .status(400)
          .json({ msg: "Please fill in all password fields" });
      }

      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch)
        return res.status(401).json({ msg: "Old password is incorrect" });

      if (newPassword !== confirmPassword)
        return res.status(400).json({ msg: "New passwords do not match" });

      if (newPassword.length < 6)
        return res
          .status(400)
          .json({ msg: "Password must be at least 6 characters" });

      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    res.json({ msg: "Profile updated successfully" });
  } catch (err) {
    console.error("Profile update error:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});


// send enquiry
router.post("/send-enquiry", idempotent("enquiry.create"), async (req, res) => {
  const { cart, user } = req.body;

  if (!cart || cart.length === 0) {
    return res.status(400).json({ msg: "Cart is empty" });
  }

  try {
    for (const item of cart) {
      if (!item.color) {
        return res.status(400).json({
          msg: "Color is required for all items",
        });
      }
    }

    const newEnquiry = new Enquiry({
      name: user?.name,
      email: user?.email,
      phone: user?.phone,
      cart: cart.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        color: item.color,
      })),
    });

    await newEnquiry.save();

    await enquiryQueue.add("process-enquiry", {
      enquiryId: newEnquiry._id,
      user,
      cart: newEnquiry.cart,
    });

    notifySuperAdmins({
      title: "New customer enquiry",
      body: `${user?.name || "A customer"} enquired about ${cart.length} item${cart.length === 1 ? "" : "s"}`,
      url: "/admin/enquiries",
    }).catch((err) => console.error("Push notify failed:", err.message));

    res.json({
      msg: "Enquiry received. Our team will contact you shortly.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to process enquiry" });
  }
});



// forogot password
router.post("/forgot-password", accountActionLimiter, async (req, res) => {
  const email = req.body;
  // Validate email
  if (!email || !email.email || !validator.isEmail(email.email)) {
    return res
      .status(400)
      .json({ msg: "Please provide a valid email address" });
  }

  try {
    // Check if user exists
    const user = await User.findOne({ email: email.email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // A resend within the cooldown window shouldn't fire a second email --
    // the client already hides the button for 60s, but this is the real
    // enforcement in case that's ever bypassed.
    if (user.lastPasswordResetRequestedAt && Date.now() - user.lastPasswordResetRequestedAt.getTime() < 60 * 1000) {
      return res.status(429).json({ msg: "Please wait a moment before requesting another reset link." });
    }

    // Generate reset token and expiry
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

    user.resetPasswordToken = resetToken;
    user.resetPasswordTokenExpiry = resetTokenExpiry;
    user.lastPasswordResetRequestedAt = new Date();
    await user.save();
    const resetLink = `${CLIENT_URL}/reset-password/${resetToken}`;

    await sendActionEmail(user.email, {
      subject: "Reset your password - Elroy Concepts",
      heading: "Reset your password",
      bodyLines: [
        `Hi ${user.name || "there"},`,
        "We received a request to reset your password. Click the button below to choose a new one.",
      ],
      buttonText: "Reset Password",
      buttonUrl: resetLink,
      footerNote: "This link expires in 1 hour. If you didn't request this, you can safely ignore this email.",
    });

    res.status(200).json({ msg: "Reset password email sent" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ msg: "Failed to send reset password email" });
  }
});

//reset password
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ msg: "Please provide all fields" });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ msg: "Passwords do not match" });
  }

  if (newPassword.length < 8) {
    return res
      .status(400)
      .json({ msg: "Password must be at least 8 characters" });
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordTokenExpiry = null;
    await user.save();

    res.status(200).json({ msg: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error.message);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
