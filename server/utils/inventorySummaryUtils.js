// services/inventorySummaryService.js
const mongoose = require("mongoose");
const Product = require("../models/productModel");

// `branch` can be a single id or an array (a branch admin holding more than
// one branch, with no single branch selected, needs to see the summary
// across all of theirs at once -- but never anyone else's).
async function getInventorySummary({ product, branch, color } = {}) {
  const branchIds = branch
    ? (Array.isArray(branch) ? branch : [branch]).map((id) => new mongoose.Types.ObjectId(id))
    : null;

  const summary = await Product.aggregate([
    { $unwind: "$inventory" },

    {
      $match: {
        ...(product && {
          _id: new mongoose.Types.ObjectId(product),
        }),
      },
    },

    {
      $lookup: {
        from: "branches",
        localField: "inventory.branch",
        foreignField: "_id",
        as: "branchInfo",
      },
    },

    // preserveNullAndEmptyArrays: a branch that's been deleted shouldn't
    // silently drop the inventory line from the report -- it should still
    // show up (as "N/A") the same way GET /sales falls back to "Deleted
    // branch" instead of vanishing the record.
    { $unwind: { path: "$branchInfo", preserveNullAndEmptyArrays: true } },

    {
      $match: {
        ...(branchIds && {
          "inventory.branch": branchIds.length === 1 ? branchIds[0] : { $in: branchIds },
        }),
        ...(color && {
          "inventory.color": color,
        }),
      },
    },

    {
      // Group by product _id, not name -- two different products can
      // legitimately share a display name (Product.name isn't unique), and
      // grouping by name would silently merge their quantities together.
      $group: {
        _id: {
          productId: "$_id",
          branch: { $ifNull: ["$branchInfo.name", "N/A"] },
          color: "$inventory.color",
        },
        product: { $first: "$name" },
        totalQuantity: { $sum: "$inventory.quantity" },
      },
    },

    {
      $project: {
        _id: 0,
        productId: "$_id.productId",
        product: 1,
        branch: "$_id.branch",
        color: "$_id.color",
        totalQuantity: 1,
      },
    },

    {
      $sort: {
        product: 1,
        branch: 1,
        color: 1,
      },
    },
  ]);

  return summary;
}

function computeProductTotals(summary) {
  const totalsMap = new Map();
  summary.forEach((item) => {
    const key = item.productId?.toString() || item.product;
    const existing = totalsMap.get(key);
    if (existing) {
      existing.total += item.totalQuantity;
    } else {
      totalsMap.set(key, { product: item.product, total: item.totalQuantity });
    }
  });
  return [...totalsMap.values()];
}

module.exports = { getInventorySummary, computeProductTotals };