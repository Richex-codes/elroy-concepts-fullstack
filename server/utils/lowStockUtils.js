const mongoose = require("mongoose");
const Product = require("../models/productModel");

const LOW_STOCK_THRESHOLD = 5;

/**
 * Groups inventory by product + branch + color (summing quantity across
 * however many inventory lines exist for that combination) and returns
 * only the combinations whose SUMMED quantity is at or below the
 * low-stock threshold.
 */
// `branchId` can be a single id or an array (a branch admin holding more
// than one branch, with no single branch selected, needs to see low stock
// across all of theirs at once -- but never anyone else's).
async function getLowStock({ branchId } = {}) {
  const pipeline = [{ $unwind: "$inventory" }];

  if (branchId) {
    const ids = (Array.isArray(branchId) ? branchId : [branchId]).map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    pipeline.push({
      $match: { "inventory.branch": ids.length === 1 ? ids[0] : { $in: ids } },
    });
  }

  pipeline.push(
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
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryInfo",
      },
    },
    { $unwind: { path: "$categoryInfo", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          product: "$_id",
          branch: "$inventory.branch",
          color: "$inventory.color",
        },
        name: { $first: "$name" },
        category: { $first: "$categoryInfo.name" },
        branchName: { $first: "$branchInfo.name" },
        quantity: { $sum: "$inventory.quantity" },
        addedAt: { $max: "$inventory.addedAt" },
      },
    },
    { $match: { quantity: { $lte: LOW_STOCK_THRESHOLD } } },
    {
      $project: {
        _id: 0,
        productId: "$_id.product",
        name: 1,
        category: { $ifNull: ["$category", "N/A"] },
        branchName: { $ifNull: ["$branchName", "N/A"] },
        color: "$_id.color",
        quantity: 1,
        addedAt: 1,
      },
    },
    { $sort: { quantity: 1 } }
  );

  return Product.aggregate(pipeline);
}

module.exports = { getLowStock, LOW_STOCK_THRESHOLD };
