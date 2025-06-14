require("dotenv").config();
const express = require("express");
const User = require("../models/usersModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const validator = require("validator");
const router = express.Router();
const { generateEnquiryPDF } = require("../utils/pdfGenerator");
const Enquiry = require("../models/enquiriesModel");

const twilio = require("twilio");
const accountSid = process.env.TWILIO_ACCOUNT_SID; // Store securely in .env
const authToken = process.env.TWILIO_AUTH_TOKEN; // Store securely in .env
const twilioClient = twilio(accountSid, authToken);
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER; // Store securely in .env
// Admin WhatsApp numbers for sending notifications

const ADMIN_WHATSAPP_NUMBERS = [
  "whatsapp:+2348107396206", // Replace with actual numbers, prefixed for WhatsApp
  "whatsapp:+2347066313719", // Example: another admin's number
];

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
  const { cart, user } = req.body; // user should contain name, email, phone

  if (!cart || cart.length === 0) {
    return res.status(400).json({ msg: "Cart is empty" });
  }

  try {
    const pdfBuffer = await generateEnquiryPDF(cart);

    // --- 1. Send Email (Existing Functionality) ---
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: "richardigwe2005@gmail.com", // Your fixed recipient email for enquiries
      subject: "New Product Enquiry",
      text:
        `New product enquiry by ${user.name || "N/A"} (${
          user.email || "N/A"
        }) (${user.phone || "N/A"})\n\nCart Details:\n` +
        cart.map((item) => `${item.name} (Qty: ${item.quantity})`).join("\n") +
        `\n\nFull details in attached PDF.`,
      attachments: [{ filename: "Product-Enquiry.pdf", content: pdfBuffer }],
    };

    await transporter.sendMail(mailOptions);
    console.log("Email enquiry sent successfully.");

    // --- 2. Construct and Send WhatsApp Message ---
    let whatsappMessage = `*New Product Enquiry*\n`;
    whatsappMessage += `From: *${user.name || "N/A"}*\n`;
    whatsappMessage += `Email: ${user.email || "N/A"}\n`;
    whatsappMessage += `Phone: ${user.phone || "N/A"}\n\n`; // Assuming user.phone is correctly passed

    whatsappMessage += `*Cart Items:*\n`;
    cart.forEach((item, index) => {
      whatsappMessage += `${index + 1}. ${item.name} (Qty: ${item.quantity})\n`;
    });

    whatsappMessage += `\n*Note*: Detailed enquiry in email attachment.`;

    // Send message to all specified recipient numbers
    const whatsappPromises = ADMIN_WHATSAPP_NUMBERS.map(async (number) => {
      try {
        await twilioClient.messages.create({
          from: TWILIO_WHATSAPP_NUMBER, // Your Twilio WhatsApp number (e.g., whatsapp:+14155238886)
          to: number, // Recipient WhatsApp number (e.g., whatsapp:+234XXXXXXXXXX)
          body: whatsappMessage,
          // If you want to send the PDF via WhatsApp, it's more complex:
          // You'd need to host the PDF publicly and provide its URL in `mediaUrl`.
          // mediaUrl: ['https://your-public-url-to-pdf.com/Product-Enquiry.pdf'],
        });
        console.log(`WhatsApp message sent to ${number}`);
      } catch (whatsappErr) {
        console.error(
          `Failed to send WhatsApp message to ${number}:`,
          whatsappErr.message
        );
        // Do not return/throw here unless you want to stop the entire request if one WhatsApp fails
      }
    });

    // Wait for all WhatsApp messages to at least attempt sending
    await Promise.allSettled(whatsappPromises);

    // --- 3. Save Enquiry to Database (Existing Functionality) ---
    const newEnquiry = new Enquiry({
      name: user.name,
      email: user.email,
      phone: user.phone,
      cart,
    });
    await newEnquiry.save();
    console.log("Enquiry saved to database.");

    res.json({ msg: "Enquiry sent successfully via email and WhatsApp" });
  } catch (error) {
    console.error("Error handling enquiry:", error); // General catch for email/PDF/DB
    res.status(500).json({ msg: "Failed to send enquiry" });
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
