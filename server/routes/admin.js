require("dotenv").config();
const express = require("express");
const Category = require("../models/productCategoryModel.js");
const jwt = require("jsonwebtoken");
const Branch = require("../models/branchesModel.js");
const Product = require("../models/productModel.js");
const Enquiry = require("../models/enquiriesModel.js");
const { generateInventoryPDF } = require("../utils/pdfGenerator.js");
const sendEmailWithPDF = require("../utils/emailSender.js");



const router = express.Router();

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

// get all categories
router.get("/categories", async (req, res) => {
  try {
    const categories = await Category.find(); // Fetch all categories
    res.json(categories); // Send the categories as JSON response
  } catch (err) {
    console.error("Error fetching categories:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Add a new category
router.post("/categories", authMiddleware, async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ msg: "Category name is required" });
  }

  try {
    const newCategory = new Category({ name });
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (err) {
    console.error("Error creating category:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Get all branches
router.get("/branches", authMiddleware, async (req, res) => {
  try {
    const branches = await Branch.find();
    res.json(branches);
  } catch (err) {
    console.error("Error fetching branches:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// save a new branch
router.post("/branches", authMiddleware, async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ msg: "Branch name is required" });
  }

  try {
    const newBranch = new Branch({ name });
    await newBranch.save();
    res.status(201).json(newBranch);
  } catch (err) {
    console.error("Error creating branch:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalCategories = await Category.countDocuments();
    const totalEnquiries = await Enquiry.countDocuments();

    res.json({
      products: totalProducts,
      categories: totalCategories,
      enquiries: totalEnquiries,
    });
  } catch (err) {
    console.error("Error fetching summary:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/summary/:branchId", authMiddleware, async (req, res) => {
  const branchId = req.params.branchId;
  try {
    const totalProducts = await Product.countDocuments({
      "inventory.branch": branchId,
    });
    const totalCategories = await Category.countDocuments(); // same, or filter differently if you want

    res.json({
      products: totalProducts,
      categories: totalCategories,
      enquiries: 0,
    });
  } catch (err) {
    console.error("Error fetching summary for branch:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// 📌 ROUTE: Generate PDF + Email
router.get("/send-inventory-summary", async (req, res) => {
  try {
    const products = await Product.find().populate("inventory.branch", "name");

    // Flatten for summary
    const inventorySummary = products.flatMap((product) =>
      product.inventory.map((inv) => ({
        name: product.name,
        branch: inv.branch.name,
        quantity: inv.quantity,
      }))
    );

    // Total per product
    const totals = {};
    inventorySummary.forEach((item) => {
      totals[item.name] = (totals[item.name] || 0) + item.quantity;
    });
    const totalSummary = Object.entries(totals).map(([name, total]) => ({
      name,
      total,
    }));

    const pdfBuffer = await generateInventoryPDF(
      inventorySummary,
      totalSummary
    );

    await sendEmailWithPDF(pdfBuffer);

    res.json({ msg: "Inventory PDF emailed successfully!" });
  } catch (err) {
    console.error("Error sending summary PDF:", err);
    res.status(500).json({ msg: "Failed to generate/send PDF" });
  }
});

// get enquiries
router.get("/enquiries", authMiddleware, async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ createdAt: -1 });
    res.json(enquiries);
  } catch (err) {
    console.error("Error fetching enquiries:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// delete an enquiry by ID
router.delete("/enquiries/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await Enquiry.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ msg: "Enquiry not found" });
    }
    res.json({ msg: "Enquiry deleted successfully" });
  } catch (err) {
    console.error("Error deleting enquiry:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
