require("dotenv").config();
const express = require("express");
const Category = require("../models/productCategoryModel.js");
const jwt = require("jsonwebtoken");
const Branch = require("../models/branchesModel.js");
const Product = require("../models/productModel.js");
const Enquiry = require("../models/enquiriesModel.js");
const { generateInventoryPDF } = require("../utils/pdfGenerator.js");
const { generateInvoicePDF } = require("../utils/generateInvoicePDF.js");
const sendEmailWithPDF = require("../utils/emailSender.js");
const Sales = require("../models/salesModel.js");
const { getInventorySummary, computeProductTotals } = require("../utils/inventorySummaryUtils.js")
const { getLowStock, LOW_STOCK_THRESHOLD } = require("../utils/lowStockUtils.js");
const { generateLowStockPDF } = require("../utils/generateLowStockPDF.js");
const { inventoryQueue } = require("../jobs/inventoryQueue.js")
const { logAudit } = require("../utils/auditLog.js");
const AuditLog = require("../models/auditLogModel.js");
const User = require("../models/usersModel.js");
const PushSubscription = require("../models/pushSubscriptionModel.js");
const { notifySuperAdmins, notifyBranchAdmins } = require("../utils/pushNotify.js");
const { idempotent } = require("../utils/idempotency.js");
const mongoose = require("mongoose");

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A sale at/above this is treated as a "big win" worth pushing a
// notification for, separate from the routine "sale recorded" flow which
// isn't notified on at all to avoid noise. Tune to the business's normal
// ticket size.
const LARGE_SALE_THRESHOLD = 100000;

// True when a branch-scoped admin is trying to touch a branch that isn't
// one of theirs (an admin can hold more than one branch). Superadmins (and,
// transitionally, any pre-migration token still missing a role claim)
// always pass -- this only ever restricts role==="admin".
function isOutsideOwnBranch(req, branchId) {
  if (req.user?.role !== "admin" || !branchId) return false;
  const own = Array.isArray(req.user.adminBranches) ? req.user.adminBranches : [];
  return !own.map(String).includes(branchId.toString());
}

// Read-side counterpart to isOutsideOwnBranch: resolves which branch(es) a
// request is actually allowed to see data for, given an optional requested
// `branch` query/param and the caller's role.
//   - superadmin -> { branches: null } (no restriction, requested branch
//     passed through as-is)
//   - branch admin, no branch requested -> their own branch list (if they
//     hold more than one, callers that can't natively query "in" a set of
//     branches should ask them to pick one instead of silently merging)
//   - branch admin, requested a branch they don't hold -> { forbidden: true }
//   - branch admin, requested one of their own branches -> that single branch
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

// Jan 1 00:00:00 - Dec 31 23:59:59.999 for the given year (defaults to
// the current year when omitted/invalid).
function getYearRange(year) {
  const y = Number(year) || new Date().getFullYear();
  return {
    year: y,
    start: new Date(y, 0, 1),
    end: new Date(y, 11, 31, 23, 59, 59, 999),
  };
}



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
    if (!decoded.isAdmin) {
      return res.status(403).json({ msg: "Admin access required" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    res.status(401).json({ msg: "Invalid token" });
  }
};

// Superadmin-only gate, stacked on top of authMiddleware. Branch-scoped
// admins pass authMiddleware (they're still admins) but must not reach
// full-access-only routes like creating other admins or reading the
// audit log.
const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ msg: "Super admin access required" });
  }
  next();
};

// Same token check as authMiddleware but without requiring isAdmin — for
// the handful of routes under /admin (like category listing) that are
// also read by the regular customer dashboard, not just the admin panel.
const requireLogin = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  const token = authHeader.replace("Bearer", "").trim();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ msg: "Invalid token" });
  }
};

// Public VAPID key the client needs to create a push subscription.
router.get("/push/vapid-public-key", (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// Register (or refresh) this browser/device's push subscription for the
// logged-in admin. Upserted by endpoint so re-subscribing the same browser
// (token refresh, re-enabling notifications) updates the existing record
// instead of creating a duplicate.
router.post("/push/subscribe", authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ msg: "Invalid push subscription" });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { user: req.user.id, endpoint, keys },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ msg: "Subscribed to notifications" });
  } catch (err) {
    console.error("Push subscribe error:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/push/unsubscribe", authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    // Scoped to the requesting user so one admin can't unsubscribe another
    // admin's device by supplying their endpoint.
    if (endpoint) await PushSubscription.deleteOne({ endpoint, user: req.user.id });
    res.json({ msg: "Unsubscribed" });
  } catch (err) {
    console.error("Push unsubscribe error:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// get all categories
router.get("/categories", requireLogin, async (req, res) => {
  try {
    const categories = await Category.find().lean(); // Fetch all categories
    res.json(categories); // Send the categories as JSON response
  } catch (err) {
    console.error("Error fetching categories:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Add a new category
router.post("/categories", authMiddleware, idempotent("category.create"), async (req, res) => {
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

// Promote an already-registered user to a branch-scoped admin by email, or
// hand an *existing* branch admin one or more additional branches (so the
// same email/account can end up covering more than one branch instead of
// needing a separate account per branch). The user must have signed up
// already — this never creates a new account. Superadmin-only: this is how
// branch access gets handed out, so it can't be self-served.
router.post("/make-admin", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { email, branches } = req.body;
    const branchIds = Array.isArray(branches) ? branches.filter(Boolean) : [];

    if (!email || typeof email !== "string") {
      return res.status(400).json({ msg: "Email is required" });
    }
    if (branchIds.length === 0) {
      return res.status(400).json({ msg: "At least one branch must be selected for this admin." });
    }

    const [user, branchDocs] = await Promise.all([
      User.findOne({ email: email.trim() }),
      Branch.find({ _id: { $in: branchIds } }),
    ]);

    if (!user) {
      return res.status(404).json({
        msg: "No registered user found with that email. They need to sign up first.",
      });
    }
    if (branchDocs.length !== branchIds.length) {
      return res.status(404).json({ msg: "One or more selected branches were not found." });
    }
    if (user.role === "superadmin") {
      return res.status(400).json({ msg: `${user.email} is already a super admin.` });
    }

    const existingBranchIds = new Set((user.adminBranches || []).map(String));
    const newlyAddedDocs = branchDocs.filter((b) => !existingBranchIds.has(b._id.toString()));

    if (user.isAdmin && newlyAddedDocs.length === 0) {
      return res.status(400).json({
        msg: `${user.email} is already an admin for ${branchDocs.map((b) => b.name).join(", ")}.`,
      });
    }

    const mergedBranchIds = [...existingBranchIds, ...branchIds.map(String)];
    user.isAdmin = true;
    user.role = "admin";
    user.adminBranches = [...new Set(mergedBranchIds)];
    await user.save();

    const allBranchNames = branchDocs.map((b) => b.name);
    await logAudit({
      action: user.isAdmin && newlyAddedDocs.length > 0 && existingBranchIds.size > 0
        ? "user.admin_branch_added"
        : "user.promoted_to_admin",
      actor: req.user,
      targetType: "User",
      targetId: user._id,
      after: {
        name: user.name,
        email: user.email,
        isAdmin: true,
        addedBranchNames: newlyAddedDocs.map((b) => b.name),
        allBranchNames,
      },
    });

    notifySuperAdmins({
      title: "New admin created",
      body: `${user.name} is now an admin for ${allBranchNames.join(", ")}`,
      url: "/admin/make-admin",
    }).catch((err) => console.error("Push notify failed:", err.message));

    res.json({
      msg: `${user.name} (${user.email}) is now an admin for ${allBranchNames.join(", ")}.`,
      user: { name: user.name, email: user.email, branches: allBranchNames },
    });
  } catch (err) {
    console.error("Error promoting user to admin:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Registered users who checked "I am a business admin" at signup but
// haven't been assigned a role yet -- this is what makes them visible to
// the superadmin in the Make Admin section, instead of promoting by blind
// email entry.
router.get("/pending-admins", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const pending = await User.find({ adminRequested: true, role: "customer" })
      .select("name email phoneNumber createdAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json(pending);
  } catch (err) {
    console.error("Error fetching pending admins:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Every current branch admin, with the branches they hold -- lets a
// superadmin see who has access to what, and relieve them of it.
router.get("/admins", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" })
      .select("name email adminBranches")
      .populate("adminBranches", "name")
      .sort({ name: 1 })
      .lean();
    res.json(admins);
  } catch (err) {
    console.error("Error fetching admins:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Relieve an admin of one branch. If that was their last branch, they're
// fully demoted back to a regular customer account (not deleted -- they
// can be re-promoted, or re-request access, later).
router.patch("/admins/:id/remove-branch", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { branch } = req.body;
    if (!branch) {
      return res.status(400).json({ msg: "Branch is required" });
    }

    const user = await User.findById(req.params.id);
    if (!user || user.role !== "admin") {
      return res.status(404).json({ msg: "Admin not found" });
    }

    const branchDoc = await Branch.findById(branch);
    const remaining = (user.adminBranches || []).filter((b) => b.toString() !== branch);
    user.adminBranches = remaining;

    let fullyDemoted = false;
    if (remaining.length === 0) {
      user.role = "customer";
      user.isAdmin = false;
      user.adminRequested = false;
      fullyDemoted = true;
    }
    await user.save();

    await logAudit({
      action: fullyDemoted ? "user.demoted_from_admin" : "user.admin_branch_removed",
      actor: req.user,
      targetType: "User",
      targetId: user._id,
      before: { branchName: branchDoc?.name },
      after: { name: user.name, email: user.email, isAdmin: user.isAdmin, remainingBranches: remaining.length },
    });

    res.json({
      msg: fullyDemoted
        ? `${user.name} has been fully relieved of admin access.`
        : `${user.name} no longer has access to ${branchDoc?.name || "that branch"}.`,
    });
  } catch (err) {
    console.error("Error removing admin branch:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Fully deactivate an admin -- removes every branch at once and reverts
// them to a regular customer account.
router.delete("/admins/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== "admin") {
      return res.status(404).json({ msg: "Admin not found" });
    }

    const branchNames = (
      await Branch.find({ _id: { $in: user.adminBranches } }).select("name").lean()
    ).map((b) => b.name);

    user.role = "customer";
    user.isAdmin = false;
    user.adminBranches = [];
    user.adminRequested = false;
    await user.save();

    await logAudit({
      action: "user.demoted_from_admin",
      actor: req.user,
      targetType: "User",
      targetId: user._id,
      before: { branchNames },
      after: { name: user.name, email: user.email, isAdmin: false },
    });

    res.json({ msg: `${user.name} has been fully relieved of admin access.` });
  } catch (err) {
    console.error("Error deactivating admin:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// Get all branches
router.get("/branches", authMiddleware, async (req, res) => {
  try {
    const branches = await Branch.find().lean();
    res.json(branches);
  } catch (err) {
    console.error("Error fetching branches:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// save a new branch
router.post("/branches", authMiddleware, idempotent("branch.create"), async (req, res) => {
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
  // This is the cross-business, all-branches total -- a branch admin has no
  // legitimate reason to see figures for branches they don't manage.
  if (req.user?.role === "admin") {
    return res.status(403).json({ message: "Use /summary/:branchId for your own branch." });
  }
  try {
    const threshold = 5;
    const { year, start, end } = getYearRange(req.query.year);

    const [
      totalProducts,
      totalCategories,
      totalEnquiries,
      inventoryStats,
      lowStockCountAgg,
      salesStats,
    ] = await Promise.all([
      Product.countDocuments(),
      Category.countDocuments(),
      Enquiry.countDocuments(),
      Product.aggregate([
        { $unwind: "$inventory" },
        {
          $group: {
            _id: null,
            totalInventoryEntries: { $sum: 1 },
            totalStockQuantity: { $sum: "$inventory.quantity" },
          },
        },
      ]),
      Product.aggregate([
        { $unwind: "$inventory" },
        { $match: { "inventory.quantity": { $lte: threshold } } },
        { $count: "lowStockCount" },
      ]),
      // Revenue/sales count are scoped to the selected year; outstanding
      // debt is not — money owed doesn't stop being owed when the year
      // turns over, so that figure always reflects everything unpaid.
      Sales.aggregate([
        {
          $facet: {
            yearly: [
              { $match: { saleDate: { $gte: start, $lte: end } } },
              {
                $group: {
                  _id: null,
                  totalSales: { $sum: 1 },
                  totalRevenue: { $sum: "$amount" },
                },
              },
            ],
            debt: [
              { $group: { _id: null, outstandingDebt: { $sum: "$balance" } } },
            ],
          },
        },
      ]),
    ]);

    const yearly = salesStats[0]?.yearly?.[0];
    const debt = salesStats[0]?.debt?.[0];

    res.json({
      year,
      products: totalProducts,
      categories: totalCategories,
      enquiries: totalEnquiries,
      inventoryEntries:
        inventoryStats[0]?.totalInventoryEntries || 0,
      stockQuantity:
        inventoryStats[0]?.totalStockQuantity || 0,
      lowStockCount:
        lowStockCountAgg[0]?.lowStockCount || 0,
      totalSales: yearly?.totalSales || 0,
      totalRevenue: yearly?.totalRevenue || 0,
      outstandingDebt: debt?.outstandingDebt || 0,
    });
  } catch (err) {
    console.error("Error fetching summary:", err);
    res.status(500).json({
      message: "Server error",
    });
  }
});

router.get("/summary/:branchId", authMiddleware, async (req, res) => {
  try {
    const { branchId } = req.params;
    if (isOutsideOwnBranch(req, branchId)) {
      return res.status(403).json({ message: "You can only view your own branch." });
    }
    const branchObjectId = new mongoose.Types.ObjectId(branchId);
    const { year, start, end } = getYearRange(req.query.year);

    const [
      totalProducts,
      totalCategories,
      totalEnquiries,
      inventoryStats,
      lowStockAgg,
      salesStats,
    ] = await Promise.all([
      Product.countDocuments({ "inventory.branch": branchId }),
      Category.countDocuments(),
      // Enquiries aren't tied to a branch, so this always reflects the
      // true total regardless of which branch is selected.
      Enquiry.countDocuments(),
      Product.aggregate([
        { $unwind: "$inventory" },
        { $match: { "inventory.branch": branchObjectId } },
        {
          $group: {
            _id: null,
            inventoryEntries: { $sum: 1 },
            stockQuantity: { $sum: "$inventory.quantity" },
          },
        },
      ]),
      Product.aggregate([
        { $unwind: "$inventory" },
        {
          $match: {
            "inventory.branch": branchObjectId,
            "inventory.quantity": { $lte: 5 },
          },
        },
        { $count: "count" },
      ]),
      Sales.aggregate([
        { $match: { branch: branchObjectId } },
        {
          $facet: {
            yearly: [
              { $match: { saleDate: { $gte: start, $lte: end } } },
              {
                $group: {
                  _id: null,
                  totalSales: { $sum: 1 },
                  totalRevenue: { $sum: "$amount" },
                },
              },
            ],
            debt: [
              { $group: { _id: null, outstandingDebt: { $sum: "$balance" } } },
            ],
          },
        },
      ]),
    ]);

    const yearly = salesStats[0]?.yearly?.[0];
    const debt = salesStats[0]?.debt?.[0];

    res.json({
      year,
      products: totalProducts,
      categories: totalCategories,
      enquiries: totalEnquiries,

      inventoryEntries:
        inventoryStats[0]?.inventoryEntries || 0,

      stockQuantity:
        inventoryStats[0]?.stockQuantity || 0,

      lowStockCount:
        lowStockAgg[0]?.count || 0,

      totalSales: yearly?.totalSales || 0,
      totalRevenue: yearly?.totalRevenue || 0,
      outstandingDebt: debt?.outstandingDebt || 0,
    });

  } catch (err) {
    console.error("Error fetching summary for branch:", err);
    res.status(500).json({ msg: "Server error" });
  }
});


// get enquiries
router.get("/enquiries", authMiddleware, async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ createdAt: -1 }).lean();
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


router.post("/sales", authMiddleware, idempotent("sale.create"), async (req, res) => {
  const { customerName, branch, items, amountPaid, saleDate } = req.body;

  if (!customerName || !branch) {
    return res.status(400).json({ message: "Customer name and branch are required" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one item is required" });
  }

  if (isOutsideOwnBranch(req, branch)) {
    return res.status(403).json({ message: "You can only record sales for your own branch" });
  }

  // Two concurrent sales for the same product+branch+color could otherwise
  // both read the same starting quantity and both write a "valid" deduction,
  // silently overselling stock (a lost update). Wrapping the whole
  // read-validate-deduct-save cycle in a transaction means MongoDB detects
  // that conflict at commit time and automatically retries the loser with a
  // fresh read, instead of letting it clobber the winner's decrement.
  const session = await mongoose.startSession();
  let sale, itemsForSale, productNameById, totalAmount, balance, lowStockLines;

  try {
    await session.withTransaction(async () => {
      // Pass 1: validate every line item before touching any inventory, so
      // a bad item later in the list can't leave earlier items
      // half-deducted. Fetch every referenced product in one round-trip
      // instead of one query per item.
      const productIds = [...new Set(items.map((line) => line.productId).filter(Boolean))];
      const products = await Product.find({ _id: { $in: productIds } }).session(session);
      const productById = new Map(products.map((p) => [p._id.toString(), p]));

      // Tracks quantity already claimed by earlier lines in *this same
      // sale* per product+color, so two lines for the same product+color
      // can't each individually pass a stock check that only holds once.
      const claimedByKey = new Map();

      const resolved = [];
      for (const line of items) {
        const qty = Number(line.quantitySold);
        if (!line.productId || !line.color || !qty || qty <= 0 || line.amount == null) {
          throw Object.assign(new Error("Each item needs a product, color, valid quantity, and amount"), { statusCode: 400 });
        }

        const product = productById.get(line.productId);
        if (!product) {
          throw Object.assign(new Error(`Product not found: ${line.productId}`), { statusCode: 404 });
        }

        const invEntries = product.inventory.filter(
          (i) => i.branch.toString() === branch && i.color === line.color
        );
        if (!invEntries.length) {
          throw Object.assign(new Error(`No inventory for "${product.name}" (${line.color}) at this branch`), { statusCode: 404 });
        }

        const key = `${line.productId}:${line.color}`;
        const alreadyClaimed = claimedByKey.get(key) || 0;
        const totalAvailable = invEntries.reduce((sum, i) => sum + i.quantity, 0);
        if (totalAvailable - alreadyClaimed < qty) {
          throw Object.assign(new Error(`Insufficient stock for "${product.name}" (${line.color})`), { statusCode: 400 });
        }
        claimedByKey.set(key, alreadyClaimed + qty);

        const rate = line.rate != null && line.rate !== "" ? Number(line.rate) : undefined;
        resolved.push({ product, invEntries, qty, color: line.color, amount: Number(line.amount), rate });
      }

      // Pass 2: everything validated, now actually deduct + save.
      itemsForSale = [];
      lowStockLines = [];
      const dirtyProducts = new Set();
      for (const { product, invEntries, qty, color, amount, rate } of resolved) {
        let remaining = qty;
        for (const i of invEntries) {
          if (remaining <= 0) break;
          if (i.quantity >= remaining) {
            i.quantity -= remaining;
            remaining = 0;
          } else {
            remaining -= i.quantity;
            i.quantity = 0;
          }
        }
        dirtyProducts.add(product);
        itemsForSale.push({
          product: product._id,
          color,
          quantitySold: qty,
          amount,
          ...(rate != null && { rate }),
        });

        // Combined remaining stock for this exact product+branch+color,
        // now that this sale's deduction has been applied above.
        const remainingQty = invEntries.reduce((sum, i) => sum + i.quantity, 0);
        if (remainingQty <= LOW_STOCK_THRESHOLD) {
          lowStockLines.push({ productName: product.name, color, remainingQty });
        }
      }

      await Promise.all([...dirtyProducts].map((p) => p.save({ session })));

      totalAmount = itemsForSale.reduce((sum, i) => sum + i.amount, 0);
      balance = totalAmount - Number(amountPaid || 0);

      sale = new Sales({
        customerName,
        branch,
        items: itemsForSale,
        amount: totalAmount,
        amountPaid: Number(amountPaid || 0),
        balance,
        saleDate: saleDate ? new Date(saleDate) : new Date(),
      });
      await sale.save({ session });

      productNameById = new Map(resolved.map((r) => [r.product._id.toString(), r.product.name]));
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  } finally {
    await session.endSession();
  }

  try {
    const branchDoc = await Branch.findById(branch);

    await logAudit({
      action: "sale.created",
      actor: req.user,
      targetType: "Sale",
      targetId: sale._id,
      after: {
        customerName: sale.customerName,
        branchName: branchDoc?.name,
        items: itemsForSale.map((i) => ({
          productName: productNameById.get(i.product.toString()),
          color: i.color,
          quantitySold: i.quantitySold,
          rate: i.rate,
          amount: i.amount,
        })),
        amount: sale.amount,
        amountPaid: sale.amountPaid,
        balance: sale.balance,
      },
    });

    const branchName = branchDoc?.name || "this branch";

    if (lowStockLines.length > 0) {
      const summary = lowStockLines
        .map((l) => `${l.productName} (${l.color}): ${l.remainingQty} left`)
        .join(", ");
      const payload = {
        title: "Low stock alert",
        body: `${branchName} — ${summary}`,
        url: "/admin/inventory",
      };
      notifyBranchAdmins(branch, payload).catch((err) => console.error("Push notify failed:", err.message));
      notifySuperAdmins(payload).catch((err) => console.error("Push notify failed:", err.message));
    }

    if (sale.balance > 0) {
      const payload = {
        title: "New debtor",
        body: `${sale.customerName} owes ₦${sale.balance.toLocaleString("en-NG")} at ${branchName}`,
        url: "/admin/debtor",
      };
      notifyBranchAdmins(branch, payload).catch((err) => console.error("Push notify failed:", err.message));
      notifySuperAdmins(payload).catch((err) => console.error("Push notify failed:", err.message));
    }

    if (sale.amount >= LARGE_SALE_THRESHOLD) {
      const payload = {
        title: "Large sale recorded",
        body: `${sale.customerName} — ₦${sale.amount.toLocaleString("en-NG")} at ${branchName}`,
        url: "/admin/sales",
      };
      notifyBranchAdmins(branch, payload).catch((err) => console.error("Push notify failed:", err.message));
      notifySuperAdmins(payload).catch((err) => console.error("Push notify failed:", err.message));
    }

    return res.json({
      message: "Sale recorded successfully",
      sale: {
        _id: sale._id,
        customerName: sale.customerName,
        branchName: branchDoc?.name || "",
        items: itemsForSale.map((i) => ({
          productName: productNameById.get(i.product.toString()),
          color: i.color,
          quantitySold: i.quantitySold,
          rate: i.rate,
          amount: i.amount,
        })),
        amount: sale.amount,
        amountPaid: sale.amountPaid,
        balance: sale.balance,
        saleDate: sale.saleDate,
      },
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
})

// get sales
router.get("/sales", authMiddleware, async (req, res) => {
  try {
    const {
      product,
      branch,
      color,
      customerName,
      fromDate,
      toDate,
    } = req.query;

    const query = {};

    if (customerName) {
      query.customerName = {
        $regex: escapeRegex(customerName),
        $options: "i",
      };
    }

    // Branch admins must never see sales for a branch they don't hold --
    // not just when they ask for one explicitly, but also when no branch
    // filter is given at all (which would otherwise return every branch's
    // sales, including full customer/amount detail).
    const scope = resolveBranchScope(req, branch);
    if (scope.forbidden) {
      return res.status(403).json({ message: "You can only view sales for your own branch." });
    }
    if (scope.branches) {
      query.branch =
        scope.branches.length === 1
          ? new mongoose.Types.ObjectId(scope.branches[0])
          : { $in: scope.branches.map((b) => new mongoose.Types.ObjectId(b)) };
    }

    // product/color live on each line item now, so match against any item
    // in the array that satisfies both conditions together.
    if (product || color) {
      query.items = {
        $elemMatch: {
          ...(product && { product: new mongoose.Types.ObjectId(product) }),
          ...(color && { color }),
        },
      };
    }

    if (fromDate || toDate) {
      query.saleDate = {};
      if (fromDate) query.saleDate.$gte = new Date(fromDate);

      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.saleDate.$lte = end;
      }
    } else {
      // No date range chosen: default to the current year rather than
      // returning every sale ever made, which only grows over time.
      const { start, end } = getYearRange();
      query.saleDate = { $gte: start, $lte: end };
    }

    const sales = await Sales.find(query)
      .populate("branch", "name")
      .populate("items.product", "name")
      .sort({ saleDate: -1 })
      .lean();

    const formatted = sales.map((sale) => ({
      _id: sale._id,
      customerName: sale.customerName,
      branch: sale.branch?.name || "Deleted branch",
      branchId: sale.branch?._id,
      items: sale.items.map((item) => ({
        productName: item.product?.name || "Deleted product",
        color: item.color,
        quantitySold: item.quantitySold,
        rate: item.rate,
        amount: item.amount,
      })),
      amount: sale.amount,
      amountPaid: sale.amountPaid,
      balance: sale.balance,
      saleDate: sale.saleDate,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Sales fetch error:", err);
    res.status(500).json({ message: "Error fetching sales" });
  }
});

// delete a sale record, restoring the inventory it had deducted (if the
// product/inventory line still exists)
router.delete("/sales/:id", authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  let sale, restoredCount;

  try {
    await session.withTransaction(async () => {
      sale = await Sales.findById(req.params.id).populate("items.product").session(session);
      if (!sale) {
        throw Object.assign(new Error("Sale not found"), { statusCode: 404 });
      }
      if (isOutsideOwnBranch(req, sale.branch)) {
        throw Object.assign(new Error("You can only delete sales for your own branch"), { statusCode: 403 });
      }

      restoredCount = 0;
      const productsToSave = new Map();

      for (const line of sale.items) {
        const product = line.product; // populated Product doc, or null if deleted
        if (!product) continue;

        const invItem = product.inventory.find(
          (i) => i.branch.toString() === sale.branch.toString() && i.color === line.color
        );
        if (invItem) {
          invItem.quantity += line.quantitySold;
          productsToSave.set(product._id.toString(), product);
          restoredCount++;
        }
      }

      await Promise.all([...productsToSave.values()].map((p) => p.save({ session })));

      await Sales.findByIdAndDelete(req.params.id).session(session);
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Failed to delete sale" });
  } finally {
    await session.endSession();
  }

  try {
    const branchDoc = await Branch.findById(sale.branch);

    await logAudit({
      action: "sale.deleted",
      actor: req.user,
      targetType: "Sale",
      targetId: sale._id,
      before: {
        customerName: sale.customerName,
        branchName: branchDoc?.name,
        items: sale.items.map((line) => ({
          productName: line.product?.name,
          color: line.color,
          quantitySold: line.quantitySold,
          rate: line.rate,
          amount: line.amount,
        })),
        amount: sale.amount,
        amountPaid: sale.amountPaid,
        balance: sale.balance,
        saleDate: sale.saleDate,
      },
      metadata: { itemsRestored: restoredCount, totalItems: sale.items.length },
    });

    const payload = {
      title: "Sale deleted",
      body: `${sale.customerName}'s ₦${sale.amount.toLocaleString("en-NG")} sale at ${branchDoc?.name || "a branch"} was deleted and stock restored`,
      url: "/admin/sales",
    };
    notifyBranchAdmins(sale.branch, payload).catch((err) => console.error("Push notify failed:", err.message));
    notifySuperAdmins(payload).catch((err) => console.error("Push notify failed:", err.message));

    res.json({ message: "Sale deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete sale" });
  }
});

// invoice PDF for a single sale (download/print)
async function loadSaleForInvoice(id) {
  const sale = await Sales.findById(id)
    .populate("branch", "name")
    .populate("items.product", "name")
    .lean();

  if (!sale) return null;

  return {
    _id: sale._id,
    branchId: sale.branch?._id,
    customerName: sale.customerName,
    branchName: sale.branch?.name,
    items: sale.items.map((line) => ({
      productName: line.product?.name,
      color: line.color,
      quantitySold: line.quantitySold,
      rate: line.rate,
      amount: line.amount,
    })),
    amount: sale.amount,
    amountPaid: sale.amountPaid,
    balance: sale.balance,
    saleDate: sale.saleDate,
  };
}

router.get("/sales/:id/invoice", authMiddleware, async (req, res) => {
  try {
    const invoiceData = await loadSaleForInvoice(req.params.id);
    if (!invoiceData) {
      return res.status(404).json({ message: "Sale not found" });
    }
    if (isOutsideOwnBranch(req, invoiceData.branchId)) {
      return res.status(403).json({ message: "You can only view invoices for your own branch." });
    }

    const pdfBuffer = await generateInvoicePDF(invoiceData);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Invoice-${invoiceData._id}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Invoice generation error:", err);
    res.status(500).json({ message: "Failed to generate invoice" });
  }
});

// email a single sale's invoice to a chosen recipient
router.post("/sales/:id/invoice/email", authMiddleware, async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ message: "Recipient email is required" });
    }

    const invoiceData = await loadSaleForInvoice(req.params.id);
    if (!invoiceData) {
      return res.status(404).json({ message: "Sale not found" });
    }
    if (isOutsideOwnBranch(req, invoiceData.branchId)) {
      return res.status(403).json({ message: "You can only email invoices for your own branch." });
    }

    const pdfBuffer = await generateInvoicePDF(invoiceData);

    await sendEmailWithPDF(pdfBuffer, to, {
      subject: `Invoice for ${invoiceData.customerName}`,
      text: "Please find your invoice attached.",
      filename: `Invoice-${invoiceData._id}.pdf`,
    });

    res.json({ message: "Invoice emailed successfully" });
  } catch (err) {
    console.error("Invoice email error:", err);
    res.status(500).json({ message: "Failed to email invoice" });
  }
});

router.get(
  "/debtors",
  authMiddleware,
  async (req, res) => {
    try {
      const { customerName, branch, fromDate, toDate } =
        req.query;

      const filter = {
        balance: { $gt: 0 },
      };

      if (customerName) {
        filter.customerName = {
          $regex: escapeRegex(customerName),
          $options: "i",
        };
      }

      const scope = resolveBranchScope(req, branch);
      if (scope.forbidden) {
        return res.status(403).json({ message: "You can only view debtors for your own branch." });
      }
      if (scope.branches) {
        filter.branch =
          scope.branches.length === 1
            ? new mongoose.Types.ObjectId(scope.branches[0])
            : { $in: scope.branches.map((b) => new mongoose.Types.ObjectId(b)) };
      }

      if (fromDate || toDate) {
        filter.saleDate = {};

        if (fromDate) {
          filter.saleDate.$gte =
            new Date(fromDate);
        }

        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);

          filter.saleDate.$lte = end;
        }
      }

      const debtors = await Sales.find(filter)
        .populate("branch", "name")
        .populate("items.product", "name")
        .sort({ saleDate: -1 })
        .lean();

      const formatted = debtors.map((sale) => ({
        _id: sale._id,
        customerName: sale.customerName,
        branch: sale.branch,
        items: sale.items.map((line) => ({
          product: line.product,
          color: line.color,
          quantitySold: line.quantitySold,
          rate: line.rate,
          amount: line.amount,
        })),
        amount: sale.amount,
        amountPaid: sale.amountPaid,
        balance: sale.balance,
        saleDate: sale.saleDate,
      }));

      res.json(formatted);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        message: "Error fetching debtors",
      });
    }
  }
);

router.patch(
  "/debtors/:id",
  authMiddleware,
  async (req, res) => {
    try {
      const debtor = await Sales.findById(
        req.params.id
      );

      if (!debtor) {
        return res.status(404).json({ message: "Debtor record not found" });
      }
      if (isOutsideOwnBranch(req, debtor.branch)) {
        return res.status(403).json({ message: "You can only clear debtors for your own branch." });
      }

      // Already cleared -- a retry of the same action (double-click, or a
      // resubmission after the first response was lost) should report
      // success without writing a second "cleared" audit entry or firing a
      // second push notification for the same event.
      if (debtor.balance <= 0) {
        return res.json({ message: "Debtor already cleared" });
      }

      const previousBalance = debtor.balance;
      const previousAmountPaid = debtor.amountPaid;

      debtor.amountPaid += debtor.balance;
      debtor.balance = 0;

      await debtor.save();

      await logAudit({
        action: "debtor.cleared",
        actor: req.user,
        targetType: "Sale",
        targetId: debtor._id,
        before: { amountPaid: previousAmountPaid, balance: previousBalance },
        after: { amountPaid: debtor.amountPaid, balance: debtor.balance },
        metadata: { customerName: debtor.customerName },
      });

      const branchDoc = await Branch.findById(debtor.branch);
      const payload = {
        title: "Debtor cleared",
        body: `${debtor.customerName} paid off ₦${previousBalance.toLocaleString("en-NG")} at ${branchDoc?.name || "their branch"}`,
        url: "/admin/debtor",
      };
      notifyBranchAdmins(debtor.branch, payload).catch((err) => console.error("Push notify failed:", err.message));
      notifySuperAdmins(payload).catch((err) => console.error("Push notify failed:", err.message));

      res.json({
        message: "Debtor cleared",
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message: "Error clearing debtor",
      });
    }
  }
);


//Inventory summary
router.get("/inventory-summary", authMiddleware, async (req, res) => {
  try {
    const scope = resolveBranchScope(req, req.query.branch);
    if (scope.forbidden) {
      return res.status(403).json({ message: "You can only view inventory for your own branch." });
    }
    const summary = await getInventorySummary({ ...req.query, branch: scope.branches || undefined });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Error generating inventory summary",
    });
  }
});

// download/print: returns the PDF bytes directly
router.get("/inventory-summary/pdf", authMiddleware, async (req, res) => {
  try {
    const scope = resolveBranchScope(req, req.query.branch);
    if (scope.forbidden) {
      return res.status(403).json({ message: "You can only view inventory for your own branch." });
    }
    const summary = await getInventorySummary({ ...req.query, branch: scope.branches || undefined });
    const totalSummary = computeProductTotals(summary);
    const pdfBuffer = await generateInventoryPDF(summary, totalSummary);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Inventory-Summary.pdf"',
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to generate PDF" });
  }
});

// send full or filtered report to a chosen recipient
router.post("/inventory-summary/email", authMiddleware, async (req, res) => {
  try {
    const { to, ...filters } = req.body;

    if (!to) {
      return res.status(400).json({ msg: "Recipient email is required" });
    }

    const scope = resolveBranchScope(req, filters.branch);
    if (scope.forbidden) {
      return res.status(403).json({ msg: "You can only email inventory for your own branch." });
    }
    filters.branch = scope.branches || undefined;

    await inventoryQueue.add("inventory-summary-email", {
      filters,
      to,
    });

    res.json({
      msg: "Inventory report queued successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to queue report" });
  }
});

// low stock alert: download/print
router.get("/low-stock/pdf", authMiddleware, async (req, res) => {
  try {
    const scope = resolveBranchScope(req, req.query.branch);
    if (scope.forbidden) {
      return res.status(403).json({ message: "You can only view low stock for your own branch." });
    }
    const lowStock = await getLowStock({ branchId: scope.branches || undefined });
    const pdfBuffer = await generateLowStockPDF(lowStock);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Low-Stock-Alert.pdf"',
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to generate PDF" });
  }
});

// low stock alert: email to a chosen recipient
router.post("/low-stock/email", authMiddleware, async (req, res) => {
  try {
    const { to, branch } = req.body;
    if (!to) {
      return res.status(400).json({ message: "Recipient email is required" });
    }

    const scope = resolveBranchScope(req, branch);
    if (scope.forbidden) {
      return res.status(403).json({ message: "You can only email low stock for your own branch." });
    }
    const lowStock = await getLowStock({ branchId: scope.branches || undefined });
    const pdfBuffer = await generateLowStockPDF(lowStock);

    await sendEmailWithPDF(pdfBuffer, to, {
      subject: "Low Stock Alert - Elroy Concepts",
      text: "Attached is the current low stock alert report.",
      filename: "Low-Stock-Alert.pdf",
    });

    res.json({ message: "Low stock report emailed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to email report" });
  }
});


//inventory stock history
router.get(
  "/inventory-stock",
  authMiddleware,
  async (req, res) => {
    try {
      const { product, branch, color, fromDate, toDate } = req.query;

      const scope = resolveBranchScope(req, branch);
      if (scope.forbidden) {
        return res.status(403).json({ message: "You can only view stock history for your own branch." });
      }

      const match = {};

      // ✅ Product filter (SAFE)
      if (
        product &&
        mongoose.Types.ObjectId.isValid(product)
      ) {
        match._id = new mongoose.Types.ObjectId(product);
      }

      // ✅ Branch filter (SAFE)
      if (scope.branches) {
        const ids = scope.branches
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));
        if (ids.length) {
          match["inventory.branch"] = ids.length === 1 ? ids[0] : { $in: ids };
        }
      }

      // ✅ Color filter
      if (color) {
        match["inventory.color"] = color;
      }

      // ✅ Date filter
      if (fromDate || toDate) {
        match["inventory.addedAt"] = {};

        if (fromDate) {
          match["inventory.addedAt"].$gte = new Date(
            fromDate
          );
        }

        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          match["inventory.addedAt"].$lte = end;
        }
      } else {
        // No date range chosen: default to the current year so this
        // ever-growing log doesn't get slow or noisy to browse. The
        // inventory *summary* report is intentionally separate from this
        // and always reflects the full running total, unaffected by year.
        const { start, end } = getYearRange();
        match["inventory.addedAt"] = { $gte: start, $lte: end };
      }

      const stock = await Product.aggregate([
        // break inventory array into rows
        { $unwind: "$inventory" },

        // apply filters safely
        { $match: match },

        // join branch info
        {
          $lookup: {
            from: "branches",
            localField: "inventory.branch",
            foreignField: "_id",
            as: "branchInfo",
          },
        },
        // A deleted branch shouldn't make this inventory line vanish from
        // the report entirely -- keep it and let branch fall back below.
        { $unwind: { path: "$branchInfo", preserveNullAndEmptyArrays: true } },

        // final shape
        {
          $project: {
            _id: 0,
            product: "$name",
            productId: "$_id",
            branch: { $ifNull: ["$branchInfo.name", "Deleted branch"] },
            branchId: "$branchInfo._id",
            color: "$inventory.color",
            quantity: "$inventory.quantity",
            description: "$inventory.description",
            addedAt: "$inventory.addedAt",
          },
        },

        // newest first
        {
          $sort: { addedAt: -1 },
        },
      ]);

      res.json(stock);
    } catch (err) {
      console.error("Inventory stock error:", err);
      res.status(500).json({
        message: "Error fetching stock",
      });
    }
  }
);

// audit log: read-only, no route ever edits or deletes entries.
// Superadmin-only -- branch admins should not be able to see actions taken
// across other branches, or by other admins.
router.get("/audit-log", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { action, actor, targetType, fromDate, toDate, limit } = req.query;

    const filter = {};

    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;

    if (actor) {
      filter.$or = [
        { actorName: { $regex: escapeRegex(actor), $options: "i" } },
        { actorEmail: { $regex: escapeRegex(actor), $options: "i" } },
      ];
    }

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    } else {
      // No date range chosen: default to the current year so this
      // permanent, ever-growing log doesn't get slow or noisy to browse.
      const { start, end } = getYearRange();
      filter.createdAt = { $gte: start, $lte: end };
    }

    const entries = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 200, 500))
      .lean();

    res.json(entries);
  } catch (err) {
    console.error("Audit log fetch error:", err);
    res.status(500).json({ message: "Error fetching audit log" });
  }
});

module.exports = router;
