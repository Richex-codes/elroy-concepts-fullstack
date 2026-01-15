require("dotenv").config();
const express = require("express");
const User = require("../models/usersModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const validator = require("validator");
const router = express.Router();
const Enquiry = require("../models/enquiriesModel");
const { enquiryQueue } = require("../jobs/queue");



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
router.post("/register", async (req, res) => {
  const { name, email, password, confirmPassword, phoneNumber } = req.body;

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

  // Check if user already exists
  const existingUser = await User.findOne({ email });
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
    email,
    password: hashedPassword,
    phoneNumber,
    verificationToken,
    verificationTokenExpiry,
  });

  try {
    const savedUser = await newUser.save();

    const verificationLink = `http://localhost:3000/verify-email/${verificationToken}`;

    // Send verification email
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Elroy Concept's" <${process.env.EMAIL_USER}>`,
      to: savedUser.email,
      subject: "Email Verification",
      html: `<p>Click the link to verify your email: <a href="${verificationLink}">Verify email</a></p>`,
    });

    res
      .status(201)
      .json({ msg: "Registered successfully. Please verify your email." });
  } catch (err) {
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

// handle login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  // check if user exist
  try {
    const user = await User.findOne({ email });
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
    const token = jwt.sign(
      {
        id: user._id,
        isAdmin: user.isAdmin,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "5h",
      }
    );
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ msg: "error logging In" });
  }
});

router.put("/profile", authMiddleware, async (req, res) => {
  const { name, phoneNumber, oldPassword, newPassword, confirmPassword } =
    req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ msg: "User not found" });

  // Update basic info
  user.name = name || user.name;
  user.phoneNumber = phoneNumber || user.phoneNumber;

  // If password change is requested
  if (oldPassword || newPassword || confirmPassword) {
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
});


// send enquiry
router.post("/send-enquiry", async (req, res) => {
  console.log("ENQUIRY ROUTE HIT");
  const { cart, user } = req.body;

  if (!cart || cart.length === 0) {
    return res.status(400).json({ msg: "Cart is empty" });
  }

  try {
    // 1️⃣ Save enquiry to DB (CRITICAL)
    const newEnquiry = new Enquiry({
      name: user?.name,
      email: user?.email,
      phone: user?.phone,
      cart
    });
    await newEnquiry.save();
    console.log("Enquiry saved to database.");

    // 2️⃣ Add background job (NON-BLOCKING)
    await enquiryQueue.add("process-enquiry", {
      enquiryId: newEnquiry._id,
      user,
      cart
    });

    // 3️⃣ Respond immediately
    res.json({
      msg: "Enquiry received. Our team will contact you shortly."
    });

  } catch (error) {
    console.error("Error handling enquiry:", error);
    res.status(500).json({ msg: "Failed to process enquiry" });
  }
});



// forogot password
router.post("/forgot-password", async (req, res) => {
  const email = req.body;
  // Validate email
  if (!email || !email.email || !validator.isEmail(email.email)) {
    return res
      .status(400)
      .json({ msg: "Please provide a valid email address" });
  }

  try {
    // Check if user exists
    const user = await User.findOne({ email: email.email });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Generate reset token and expiry
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

    user.resetPasswordToken = resetToken;
    user.resetPasswordTokenExpiry = resetTokenExpiry;
    await user.save();
    const resetLink = `http://localhost:3000/reset-password/${resetToken}`;

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Elroy Concept's" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Forgot Password",
      html: `<p>Click the link to reset your password: <a href="${resetLink}">Reset Password</a></p>`,
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
