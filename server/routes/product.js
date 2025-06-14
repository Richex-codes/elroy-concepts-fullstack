const express = require("express");
const router = express.Router();
const Product = require("../models/productModel");
const jwt = require("jsonwebtoken");

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

// Get all products
router.get("/", authMiddleware, async (req, res) => {
  try {
    const products = await Product.find()
      .populate("category", "name")
      .populate("inventory.branch", "name");
    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

//multer setup for image upload
const multer = require("multer");
const path = require("path");

// Set storage location and filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // folder to store uploaded files
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.post(
  "/",
  authMiddleware,
  upload.single("image"), // multer middleware to handle image
  async (req, res) => {
    try {
      const { name, category, description } = req.body;

      if (!name || !category || !req.file) {
        return res.status(400).json({ msg: "All fields are required" });
      }

      // Parse inventory array (it's sent as a string)
      const inventory = JSON.parse(req.body.inventory); // <- from frontend

      const newProduct = new Product({
        name,
        description,
        category,
        image: req.file.filename, // save image path
        inventory, // already in [{ branch, quantity }, ...] format
      });

      await newProduct.save();
      res
        .status(201)
        .json({ msg: "Product added successfully", product: newProduct });
    } catch (err) {
      console.error("Error saving product:", err.message);
      res.status(500).json({ msg: "Server error" });
    }
  }
);

// Add inventory to existing product
router.post("/:id/add-inventory", authMiddleware, async (req, res) => {
  const productId = req.params.id;
  const { branch, quantity } = req.body;

  if (!branch || !quantity || isNaN(quantity)) {
    return res
      .status(400)
      .json({ msg: "Branch and valid quantity are required" });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ msg: "Product not found" });

    product.inventory.push({
      branch,
      quantity: parseInt(quantity),
      addedAt: new Date(),
    });

    await product.save();
    res.status(200).json({ msg: "Inventory added successfully" });
  } catch (error) {
    console.error("Error adding inventory:", error.message);
    res.status(500).json({ msg: "Server error" });
  }
});

//delete product
router.delete("/:id", authMiddleware, async (req, res) => {
  const productId = req.params.id;

  try {
    const product = await Product.findByIdAndDelete(productId);
    if (!product) return res.status(400).json({ msg: "Product not found" });
    res.status(200).json({ msg: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// PUT /products/:productId/inventory/:inventoryId
router.put("/:productId/:inventoryId", authMiddleware, async (req, res) => {
  const { quantity } = req.body;
  const { productId, inventoryId } = req.params;

  try {
    const product = await Product.findById(productId);
    const inventoryItem = product.inventory.id(inventoryId);
    if (!inventoryItem)
      return res.status(404).json({ msg: "Inventory item not found" });

    inventoryItem.quantity = quantity;
    await product.save();
    res.json({ msg: "Quantity updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// recent product added
router.get("/recent", authMiddleware, async (req, res) => {
  try {
    const recentProducts = await Product.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("category", "name")
      .populate("inventory.branch", "name");
    res.json(recentProducts);
  } catch (err) {
    console.error("Error fetching recent products:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// recent product for a specific branch
router.get("/recent/:branchId", authMiddleware, async (req, res) => {
  const branchId = req.params.branchId;

  try {
    const products = await Product.find({ "inventory.branch": branchId })
      .populate("category", "name")
      .populate("inventory.branch", "name");

    // Flatten the inventory and filter by branch
    const matchingInventory = products.flatMap((product) =>
      product.inventory
        .filter((item) => item.branch._id.toString() === branchId)
        .map((item) => ({
          productId: product._id,
          name: product.name,
          category: product.category?.name,
          branchName: item.branch.name,
          addedAt: item.addedAt,
        }))
    );

    // Sort by addedAt DESC and limit to 5
    const recent = matchingInventory
      .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
      .slice(0, 5);

    res.json(recent);
  } catch (err) {
    console.error("Error fetching recent products for branch:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Get recently added inventory entries (latest 5)
router.get("/recent-inventory", async (req, res) => {
  try {
    const products = await Product.find()
      .populate("category", "name")
      .populate("inventory.branch", "name")
      .sort({ "inventory.addedAt": -1 });

    // Flatten and collect all inventory entries
    const allEntries = products.flatMap((product) =>
      product.inventory.map((entry) => ({
        name: product.name,
        branch: entry.branch.name,
        quantity: entry.quantity,
        addedAt: entry.addedAt,
      }))
    );

    // Sort by date descending and take top 5
    const recent = allEntries
      .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
      .slice(0, 5);

    res.json(recent);
  } catch (err) {
    console.error("Error fetching recent inventory:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// recent ineventory for a specific branch
router.get("/recent-inventory/:branchId", authMiddleware, async (req, res) => {
  const { branchId } = req.params;

  try {
    // Find products that have inventory for the branch
    const products = await Product.find({ "inventory.branch": branchId })
      .populate("category", "name")
      .populate("inventory.branch", "name")
      .sort({ createdAt: -1 });

    // Flatten the inventory array to get only the inventories for that branch
    const recentInventory = products.flatMap((product) =>
      product.inventory
        .filter((inv) => inv.branch._id.toString() === branchId)
        .map((inv) => ({
          productId: product._id,
          name: product.name,
          category: product.category?.name,
          branch: inv.branch.name,
          quantity: inv.quantity,
          addedAt: inv.addedAt || product.createdAt, // fallback if no addedAt
        }))
    );

    // Sort by addedAt (or createdAt fallback) and limit to 5
    recentInventory.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    res.json(recentInventory.slice(0, 5));
  } catch (err) {
    console.error("Error fetching recent inventory:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/low-stock", authMiddleware, async (req, res) => {
  const threshold = 5;

  try {
    const products = await Product.find()
      .populate("category", "name")
      .populate("inventory.branch", "name");

    // Extract low stock inventory
    const lowStock = [];

    for (const product of products) {
      for (const inv of product.inventory) {
        if (inv.quantity <= threshold) {
          lowStock.push({
            productId: product._id,
            name: product.name,
            category: product.category.name,
            branchName: inv.branch.name,
            quantity: inv.quantity,
          });
        }
      }
    }

    res.json(lowStock);
  } catch (err) {
    console.error("Error fetching low stock:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET product by category
router.get("/category/:categoryId", authMiddleware, async (req, res) => {
  const { categoryId } = req.params;
  try {
    const products = await Product.find({ category: categoryId })
      .populate("category", "name")
      .populate("inventory.branch", "name");
    if (!products || products.length === 0) {
      return res
        .status(404)
        .json({ msg: "No products found for this category" });
    }
    res.json(products);
  } catch (err) {
    console.error("Error fetching products by category:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
