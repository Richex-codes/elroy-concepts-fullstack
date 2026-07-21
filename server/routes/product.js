require("dotenv").config();
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../models/productModel");
const Branch = require("../models/branchesModel.js");
const Category = require("../models/productCategoryModel.js");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const path = require("path");
const { getLowStock } = require("../utils/lowStockUtils");
const { logAudit } = require("../utils/auditLog");
const { notifySuperAdmins, notifyBranchAdmins } = require("../utils/pushNotify");
const { idempotent } = require("../utils/idempotency");

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// True when a branch-scoped admin is trying to touch a branch that isn't
// one of theirs (an admin can hold more than one branch). Superadmins (and,
// transitionally, any pre-migration token still missing a role claim)
// always pass -- this only ever restricts role==="admin".
function isOutsideOwnBranch(req, branchId) {
  if (req.user?.role !== "admin" || !branchId) return false;
  const own = Array.isArray(req.user.adminBranches) ? req.user.adminBranches : [];
  return !own.map(String).includes(branchId.toString());
}

// Read-side counterpart to isOutsideOwnBranch -- resolves which branch(es)
// a "give me everything" style request (no branchId in the URL) is
// actually allowed to see, instead of defaulting to every branch.
function resolveBranchScope(req, requestedBranch) {
  if (req.user?.role !== "admin") {
    return { branches: requestedBranch ? [requestedBranch] : null };
  }
  const own = Array.isArray(req.user.adminBranches) ? req.user.adminBranches.map(String) : [];
  if (requestedBranch) {
    if (!own.includes(requestedBranch.toString())) {
      return { forbidden: true };
    }
    return { branches: [requestedBranch] };
  }
  return { branches: own };
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Set storage for Multer to Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "elroy-concepts-products", // Optional: specify a folder in your Cloudinary account
    format: async (req, file) => "jpeg", // supports 'png', 'jpg', 'gif', etc.
    public_id: (req, file) => {
      // Generate a unique public_id based on timestamp and original filename
      // (without extension). The filename is fully attacker-controlled (a
      // client can name an upload anything), so it's stripped down to a safe
      // character set before use -- this is the actual reachable path for
      // the known Cloudinary SDK "ampersand parameter injection" advisory
      // (GHSA-g4mf-96x5-5m2c), which the installed cloudinary@1.x doesn't
      // patch (multer-storage-cloudinary pins ^1.21.0 as a peer dependency,
      // so bumping to the fixed 2.x line would break uploads entirely).
      const filenameWithoutExt = file.originalname
        .split(".")
        .slice(0, -1)
        .join(".")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 100);
      return `product-${Date.now()}-${filenameWithoutExt}`;
    },
    transformation: [{ width: 500, height: 500, crop: "limit" }], // Optional: Resize/transform images on upload
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB -- plenty for a product photo, blocks accidental/malicious huge uploads
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

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

// A handful of routes below (product listing, category browsing) are meant
// to stay reachable by any logged-in user, including regular customers once
// the storefront is reactivated, so they only use authMiddleware. Anything
// that mutates data or exposes internal business/inventory analytics also
// requires this on top of authMiddleware.
const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ msg: "Admin access required" });
  }
  next();
};

// Full-product deletion removes every branch's inventory for that product at
// once, so it's reserved for superadmins -- a branch admin uses the
// per-branch inventory-line delete route instead.
const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ msg: "Super admin access required" });
  }
  next();
};

// Get all products
router.get("/", authMiddleware, async (req, res) => {
  try {
    const products = await Product.find()
      .populate("category", "name")
      .populate("inventory.branch", "name")
      .lean();
    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

//multer setup for image upload

// POST a new product (MODIFIED)
router.post(
  "/",
  authMiddleware,
  requireAdmin,
  idempotent("product.create"), // before the upload, so a detected retry skips re-uploading the image too
  upload.single("image"), // Use the Cloudinary-configured Multer
  async (req, res) => {
    try {
      const { name, category, dateAdded } = req.body;

      let imageUrl = "";
      if (req.file) {
        imageUrl = req.file.path; // Cloudinary returns the URL in the path property
      }

      // Check for req.file, as Cloudinary upload might fail or be missing
      if (!name || !category || !dateAdded ) {
        return res
          .status(400)
          .json({ msg: "All fields are required, including an image." });
      }

      // Parse inventory array (it's sent as a string)
      const inventory = JSON.parse(req.body.inventory);

      const outsideBranchEntry = inventory.find((item) => isOutsideOwnBranch(req, item.branch));
      if (outsideBranchEntry) {
        return res.status(403).json({ msg: "You can only add inventory for your own branch." });
      }

      const newProduct = new Product({
        name,
        category,
        image: imageUrl,
        inventory: inventory.map((item) => ({
          ...item,
          addedAt: dateAdded || Date.now(),
        })),
        dateAdded,
      });

      await newProduct.save();
      res
        .status(201)
        .json({ msg: "Product added successfully", product: newProduct });
    } catch (err) {
      console.error(
        "Error saving product or uploading image to Cloudinary:",
        err.message
      );
      // More specific error handling for Multer/Cloudinary errors might be useful here
      res
        .status(500)
        .json({ msg: "Server error during product creation or image upload." });
    }
  }
);


router.get("/product-inventory", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, category, branch, color } = req.query;

    const scope = resolveBranchScope(req, branch);
    if (scope.forbidden) {
      return res.status(403).json({ message: "You can only view your own branch." });
    }

    const products = await Product.aggregate([
      // CATEGORY
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },

      // INVENTORY (SAFE)
      {
        $unwind: {
          path: "$inventory",
          preserveNullAndEmptyArrays: true,
        },
      },

      // BRANCH
      {
        $lookup: {
          from: "branches",
          localField: "inventory.branch",
          foreignField: "_id",
          as: "branchInfo",
        },
      },
      {
        $unwind: {
          path: "$branchInfo",
          preserveNullAndEmptyArrays: true,
        },
      },

      // FILTERS
      {
        $match: {
          ...(name && {
            name: { $regex: escapeRegex(name), $options: "i" },
          }),

          ...(category && {
            "category.name": {
              $regex: escapeRegex(category),
              $options: "i",
            },
          }),

          ...(scope.branches && {
            "branchInfo._id":
              scope.branches.length === 1
                ? new mongoose.Types.ObjectId(scope.branches[0])
                : { $in: scope.branches.map((b) => new mongoose.Types.ObjectId(b)) },
          }),

          ...(color && {
            "inventory.color": color,
          }),
        },
      },

      // FINAL OUTPUT (FLAT STRUCTURE)
      {
        $project: {
          _id: 0,
          productId: "$_id",
          inventoryId: "$inventory._id",
          productName: "$name",
          category: "$category.name",
          branch: "$branchInfo.name",
          branchId: "$branchInfo._id",
          color: "$inventory.color",
          image: "$image",
        },
      },

      { $sort: { productName: 1 } },
    ]);

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching inventory view" });
  }
});



// Add inventory to existing product
router.post("/:id/add-inventory", authMiddleware, requireAdmin, idempotent("inventory.add"), async (req, res) => {
  const productId = req.params.id;
  const { branch, quantity, color, description, addedAt } = req.body;

  if (!branch || !quantity || isNaN(quantity)) {
    return res
      .status(400)
      .json({ msg: "Branch and valid quantity are required" });
  }

  if (isOutsideOwnBranch(req, branch)) {
    return res.status(403).json({ msg: "You can only add inventory for your own branch." });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ msg: "Product not found" });

    product.inventory.push({
      branch,
      quantity: parseInt(quantity),
      color,
      description,
      addedAt
    });

    await product.save();

    const branchDoc = await Branch.findById(branch);

    await logAudit({
      action: "inventory.restocked",
      actor: req.user,
      targetType: "Product",
      targetId: product._id,
      after: {
        branchName: branchDoc?.name,
        quantity: parseInt(quantity),
        color,
        description,
      },
      metadata: { productName: product.name },
    });

    res.status(200).json({ msg: "Inventory added successfully" });
  } catch (error) {
    console.error("Error adding inventory:", error.message);
    res.status(500).json({ msg: "Server error" });
  }
});

//delete product (removes it -- and every branch's inventory for it -- entirely)
router.delete("/:id", authMiddleware, requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await Product.findByIdAndDelete(req.params.id);

    const [categoryDoc, branches] = await Promise.all([
      Category.findById(product.category),
      Branch.find(),
    ]);
    const branchNameById = new Map(
      branches.map((b) => [b._id.toString(), b.name])
    );

    await logAudit({
      action: "product.deleted",
      actor: req.user,
      targetType: "Product",
      targetId: product._id,
      before: {
        name: product.name,
        categoryName: categoryDoc?.name,
        inventory: product.inventory.map((line) => ({
          branchName:
            branchNameById.get(line.branch?.toString()) || "Unknown branch",
          color: line.color,
          quantity: line.quantity,
        })),
      },
    });

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting product" });
  }
});

// Delete a single inventory line (one branch+color entry) from a product,
// leaving the product and every other branch's stock untouched. This is
// the branch-scoped counterpart to the full-product delete above -- a
// branch admin can only remove their own branch's line.
// Idempotent: if the line is already gone (e.g. a retried/double-clicked
// request), this reports success rather than erroring.
router.delete("/:productId/inventory/:inventoryId", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { productId, inventoryId } = req.params;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const line = product.inventory.id(inventoryId);
    if (!line) {
      // Already removed -- same end state as a successful delete, so this
      // is a success, not a 404, to keep repeat calls idempotent.
      return res.json({ message: "Inventory item already removed" });
    }

    if (isOutsideOwnBranch(req, line.branch)) {
      return res.status(403).json({ message: "You can only delete inventory for your own branch." });
    }

    const branchDoc = await Branch.findById(line.branch);
    const removed = {
      branchName: branchDoc?.name || "Unknown branch",
      color: line.color,
      quantity: line.quantity,
    };

    line.deleteOne();
    await product.save();

    await logAudit({
      action: "inventory.removed",
      actor: req.user,
      targetType: "Product",
      targetId: product._id,
      before: removed,
      metadata: { productName: product.name },
    });

    const pushPayload = {
      title: "Inventory item deleted",
      body: `${product.name} (${removed.color}, ${removed.quantity} units) removed from ${removed.branchName}`,
      url: "/admin/products",
    };
    notifyBranchAdmins(line.branch, pushPayload).catch((err) => console.error("Push notify failed:", err.message));
    notifySuperAdmins(pushPayload).catch((err) => console.error("Push notify failed:", err.message));

    res.json({ message: "Inventory item deleted successfully" });
  } catch (err) {
    console.error("Error deleting inventory line:", err);
    res.status(500).json({ message: "Error deleting inventory item" });
  }
});

// recent product added
router.get("/recent-products", authMiddleware, async (req, res) => {
  try {
    const scope = resolveBranchScope(req, null);
    const filter = scope.branches ? { "inventory.branch": { $in: scope.branches } } : {};
    const recent = await Product.find(filter)
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json(recent);
  } catch (err) {
    console.error("Error fetching recent products:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/recent-products/:branchId", authMiddleware, async (req, res) => {
  const { branchId } = req.params;
  if (isOutsideOwnBranch(req, branchId)) {
    return res.status(403).json({ msg: "You can only view your own branch." });
  }

  try {
    const products = await Product.find({ "inventory.branch": branchId })
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recent = products.map((product) => ({
      _id: product._id,
      productId: product._id,
      name: product.name,
      category: product.category,
      image: product.image,
      createdAt: product.createdAt,
    }));

    res.json(recent);
  } catch (err) {
    console.error("Error fetching recent products:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// Shared by both recent-inventory routes below: unwind + sort + limit to 5
// *before* joining category/branch names, instead of pulling every
// product's entire inventory history into Node and sorting it there.
// `matchBranchId` may be a single id or an array.
function recentInventoryPipeline(matchBranchId) {
  const ids = matchBranchId
    ? (Array.isArray(matchBranchId) ? matchBranchId : [matchBranchId]).map(
        (id) => new mongoose.Types.ObjectId(id)
      )
    : null;
  return [
    { $unwind: "$inventory" },
    ...(ids
      ? [{ $match: { "inventory.branch": ids.length === 1 ? ids[0] : { $in: ids } } }]
      : []),
    { $sort: { "inventory.addedAt": -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "branches",
        localField: "inventory.branch",
        foreignField: "_id",
        as: "branchInfo",
      },
    },
    { $unwind: { path: "$branchInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productId: "$_id",
        productName: "$name",
        category: "$category.name",
        branch: "$branchInfo.name",
        quantity: "$inventory.quantity",
        color: "$inventory.color",
        description: { $ifNull: ["$inventory.description", "N/A"] },
        addedAt: "$inventory.addedAt",
      },
    },
  ];
}

// Get recently added inventory entries (latest 5)
router.get("/recent-inventory", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const scope = resolveBranchScope(req, null);
    const recent = await Product.aggregate(recentInventoryPipeline(scope.branches));
    res.json(recent);
  } catch (err) {
    console.error("Error fetching recent inventory:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// recent inventory for a specific branch
router.get("/recent-inventory/:branchId", authMiddleware, requireAdmin, async (req, res) => {
  const { branchId } = req.params;
  if (isOutsideOwnBranch(req, branchId)) {
    return res.status(403).json({ msg: "You can only view your own branch." });
  }

  try {
    const recent = await Product.aggregate(recentInventoryPipeline(branchId));
    res.json(recent);
  } catch (err) {
    console.error("Error fetching recent inventory:", err);
    res.status(500).json({ msg: "Server error" });
  }
});


router.get("/low-stock", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const scope = resolveBranchScope(req, null);
    const lowStock = await getLowStock({ branchId: scope.branches || undefined });
    res.json(lowStock);
  } catch (err) {
    console.error("Error fetching low stock:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/low-stock/:branchId", authMiddleware, requireAdmin, async (req, res) => {
  if (isOutsideOwnBranch(req, req.params.branchId)) {
    return res.status(403).json({ msg: "You can only view your own branch." });
  }
  try {
    const lowStock = await getLowStock({ branchId: req.params.branchId });
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
