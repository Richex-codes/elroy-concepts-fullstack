const Product = require("../models/productModel");
const StockValueSnapshot = require("../models/stockValueSnapshotModel");

function todayMidnightUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Nightly job: records each branch's total stock value as of right now.
// Building up daily history here is what lets getInventoryTurnover
// (analyticsUtils.js) average stock value across a real date range instead
// of falling back to a single live snapshot for every query -- see that
// function for the fallback behavior while this history is still thin.
async function runStockValueSnapshot() {
  try {
    const perBranch = await Product.aggregate([
      { $unwind: "$inventory" },
      { $unwind: { path: "$inventory.batches", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$inventory.branch",
          stockValue: {
            $sum: {
              $multiply: [
                { $ifNull: ["$inventory.batches.quantityRemaining", 0] },
                { $ifNull: ["$inventory.batches.unitLandedCost", 0] },
              ],
            },
          },
        },
      },
    ]);

    const date = todayMidnightUTC();

    await Promise.all(
      perBranch.map((row) =>
        StockValueSnapshot.findOneAndUpdate(
          { date, branch: row._id },
          { date, branch: row._id, stockValue: row.stockValue },
          { upsert: true, setDefaultsOnInsert: true }
        )
      )
    );

    console.log(`✅ Stock value snapshot recorded for ${perBranch.length} branch(es)`);
  } catch (err) {
    console.error("❌ Stock value snapshot failed:", err.message);
  }
}

module.exports = { runStockValueSnapshot };
