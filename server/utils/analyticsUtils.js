// Read-only profit/turnover/dead-stock/trend analytics, built entirely on
// data Phases 0-1 already store (Product.inventory[].batches[],
// Sales.items[].landedCostAtSale/costEstimated). No writes, no schema
// changes -- pure aggregation.

const mongoose = require("mongoose");
const Product = require("../models/productModel");
const Sales = require("../models/salesModel");
const StockValueSnapshot = require("../models/stockValueSnapshotModel");

function round2(n) {
  return Math.round(n * 100) / 100;
}

// `branches` is resolveBranchScope's output: null (superadmin, unscoped),
// or an array of one-or-more branch ids to match against `fieldPath`.
function branchMatchStage(fieldPath, branches) {
  if (!branches) return {};
  const ids = branches.map((b) => new mongoose.Types.ObjectId(b));
  return { [fieldPath]: ids.length === 1 ? ids[0] : { $in: ids } };
}

function dateRangeMatch(fieldPath, fromDate, toDate) {
  if (!fromDate && !toDate) return {};
  const range = {};
  if (fromDate) range.$gte = new Date(fromDate);
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [fieldPath]: range };
}

function saleDateMatch(fromDate, toDate) {
  return dateRangeMatch("saleDate", fromDate, toDate);
}

// revenue = Σ items.amount (already a line total).
// cogs = Σ (items.landedCostAtSale × items.quantitySold).
// Sales predating Phase 1 have no landedCostAtSale at all -- $ifNull treats
// that as 0 for the cogs sum (so old sales don't crash the aggregation),
// but noCostDataLineCount surfaces exactly how many lines that affects
// separately from costEstimated (which means "we have a cost, just an
// uncertain one" -- a materially different, less severe caveat).
async function getProfitSummary({ branches, fromDate, toDate }) {
  const match = {
    ...saleDateMatch(fromDate, toDate),
    ...branchMatchStage("branch", branches),
  };

  const result = await Sales.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$items.amount" },
        cogs: {
          $sum: {
            $multiply: [{ $ifNull: ["$items.landedCostAtSale", 0] }, "$items.quantitySold"],
          },
        },
        estimatedCogs: {
          $sum: {
            $cond: [
              { $eq: ["$items.costEstimated", true] },
              { $multiply: [{ $ifNull: ["$items.landedCostAtSale", 0] }, "$items.quantitySold"] },
              0,
            ],
          },
        },
        estimatedLineCount: { $sum: { $cond: [{ $eq: ["$items.costEstimated", true] }, 1, 0] } },
        noCostDataLineCount: { $sum: { $cond: [{ $eq: ["$items.landedCostAtSale", null] }, 1, 0] } },
        totalLineCount: { $sum: 1 },
      },
    },
  ]);

  const r = result[0] || {
    revenue: 0,
    cogs: 0,
    estimatedCogs: 0,
    estimatedLineCount: 0,
    noCostDataLineCount: 0,
    totalLineCount: 0,
  };

  const grossProfit = r.revenue - r.cogs;

  return {
    revenue: r.revenue,
    cogs: r.cogs,
    grossProfit,
    grossMarginPct: r.revenue > 0 ? round2((grossProfit / r.revenue) * 100) : 0,
    estimatedCogs: {
      amount: r.estimatedCogs,
      percentOfCogs: r.cogs > 0 ? round2((r.estimatedCogs / r.cogs) * 100) : 0,
      lineCount: r.estimatedLineCount,
    },
    noCostDataLineCount: r.noCostDataLineCount,
    totalLineCount: r.totalLineCount,
  };
}

// turnover = cogs (over the period) ÷ average stock value over that same
// period. The average comes from stockValueSnapshotTask.js's nightly
// per-branch snapshots (StockValueSnapshot): one total per day across the
// branches in scope, averaged across however many days fall in the range.
// Before enough history has accumulated for a given range (e.g. right after
// this feature shipped, or a range further back than the snapshots go),
// falls back to a live "right now" stock value -- same approximation this
// endpoint used exclusively before snapshotting existed.
async function getInventoryTurnover({ branches, fromDate, toDate }) {
  const { cogs } = await getProfitSummary({ branches, fromDate, toDate });

  const snapshotMatch = {
    ...branchMatchStage("branch", branches),
    ...dateRangeMatch("date", fromDate, toDate),
  };

  const dailyTotals = await StockValueSnapshot.aggregate([
    { $match: snapshotMatch },
    { $group: { _id: "$date", totalValue: { $sum: "$stockValue" } } },
  ]);

  if (dailyTotals.length > 0) {
    const stockValue = round2(
      dailyTotals.reduce((sum, d) => sum + d.totalValue, 0) / dailyTotals.length
    );
    return {
      cogs,
      stockValue,
      turnoverRatio: stockValue > 0 ? round2(cogs / stockValue) : null,
      basis: "snapshotAverage",
      snapshotDaysUsed: dailyTotals.length,
      note: `Averaged across ${dailyTotals.length} daily stock-value snapshot${dailyTotals.length === 1 ? "" : "s"} recorded during this period.`,
    };
  }

  const branchMatch = branchMatchStage("inventory.branch", branches);
  const stockResult = await Product.aggregate([
    { $unwind: "$inventory" },
    ...(Object.keys(branchMatch).length ? [{ $match: branchMatch }] : []),
    { $unwind: { path: "$inventory.batches", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
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

  const stockValue = stockResult[0]?.stockValue || 0;

  return {
    cogs,
    stockValue,
    turnoverRatio: stockValue > 0 ? round2(cogs / stockValue) : null,
    basis: "liveSnapshot",
    snapshotDaysUsed: 0,
    note:
      "No daily stock-value history recorded yet for this period, so this uses a live snapshot " +
      "taken just now instead of a period average. Becomes a real average automatically once " +
      "daily snapshots build up for the range you're viewing.",
  };
}

// Batches with stock still remaining, last touched (arrivalDate) longer
// ago than thresholdDays -- biggest tied-up capital first.
async function getDeadStock({ branches, thresholdDays = 90, limit = 50 }) {
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  const branchMatch = branchMatchStage("inventory.branch", branches);

  const results = await Product.aggregate([
    { $unwind: "$inventory" },
    ...(Object.keys(branchMatch).length ? [{ $match: branchMatch }] : []),
    { $unwind: "$inventory.batches" },
    {
      $match: {
        "inventory.batches.quantityRemaining": { $gt: 0 },
        "inventory.batches.arrivalDate": { $lte: cutoff },
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
    { $unwind: { path: "$branchInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productId: "$_id",
        productName: "$name",
        branchId: "$inventory.branch",
        branchName: { $ifNull: ["$branchInfo.name", "N/A"] },
        color: "$inventory.color",
        quantityRemaining: "$inventory.batches.quantityRemaining",
        unitLandedCost: "$inventory.batches.unitLandedCost",
        arrivalDate: "$inventory.batches.arrivalDate",
        costEstimated: "$inventory.batches.costEstimated",
        tiedUpValue: {
          $multiply: ["$inventory.batches.quantityRemaining", "$inventory.batches.unitLandedCost"],
        },
      },
    },
    { $sort: { tiedUpValue: -1 } },
    { $limit: limit },
  ]);

  const now = Date.now();
  return results.map((r) => ({
    ...r,
    daysInStock: Math.floor((now - new Date(r.arrivalDate).getTime()) / (24 * 60 * 60 * 1000)),
  }));
}

// Last 12 months (including the current one), oldest first, zero-filled --
// grouped in Mongo, then merged into a JS-generated month scaffold since an
// aggregation won't produce buckets for months with no sales at all.
async function getRevenueTrend({ branches }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const match = {
    saleDate: { $gte: start },
    ...branchMatchStage("branch", branches),
  };

  const results = await Sales.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: { year: { $year: "$saleDate" }, month: { $month: "$saleDate" } },
        revenue: { $sum: "$items.amount" },
        cogs: {
          $sum: {
            $multiply: [{ $ifNull: ["$items.landedCostAtSale", 0] }, "$items.quantitySold"],
          },
        },
      },
    },
  ]);

  const byKey = new Map(results.map((r) => [`${r._id.year}-${r._id.month}`, r]));

  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const found = byKey.get(`${year}-${month}`);
    const revenue = found?.revenue || 0;
    const cogs = found?.cogs || 0;
    months.push({
      year,
      month,
      label: `${year}-${String(month).padStart(2, "0")}`,
      revenue,
      cogs,
      grossProfit: revenue - cogs,
    });
  }

  return { months };
}

// Buckets outstanding balance by days since saleDate: 0-30 / 31-60 / 61-90 /
// 90+. There's no separate due-date/credit-terms field on a Sale, so "age"
// is measured from the sale itself, matching how the existing /debtors
// list already treats it.
async function getDebtorAging({ branches }) {
  const match = {
    balance: { $gt: 0 },
    ...branchMatchStage("branch", branches),
  };
  const now = new Date();

  const result = await Sales.aggregate([
    { $match: match },
    {
      $addFields: {
        // Clamped at 0 so a sale with a future-dated saleDate (bad manual
        // entry) can't fall outside the bucket boundaries and get
        // miscategorized into the 90+ default bucket.
        daysOverdue: {
          $max: [
            0,
            { $floor: { $divide: [{ $subtract: [now, "$saleDate"] }, 1000 * 60 * 60 * 24] } },
          ],
        },
      },
    },
    {
      $bucket: {
        groupBy: "$daysOverdue",
        boundaries: [0, 31, 61, 91],
        default: "90+",
        output: {
          totalOutstanding: { $sum: "$balance" },
          count: { $sum: 1 },
        },
      },
    },
  ]);

  const labelByBoundary = { 0: "0-30", 31: "31-60", 61: "61-90" };
  const buckets = [0, 31, 61, "90+"].map((key) => {
    const found = result.find((r) => r._id === key);
    return {
      label: key === "90+" ? "90+" : labelByBoundary[key],
      totalOutstanding: found?.totalOutstanding || 0,
      count: found?.count || 0,
    };
  });

  return {
    buckets,
    totalOutstanding: buckets.reduce((sum, b) => sum + b.totalOutstanding, 0),
  };
}

// invoiced = Σ amount, collected = Σ amountPaid, for sales dated in the
// period. There's no dated payment ledger -- amountPaid is a running total
// on the sale itself, not a timestamped receipt -- so a balance cleared
// today for a sale made last month shows up against LAST MONTH's invoiced
// total, not today's. This is a lifetime-to-date view per sale, not a true
// cash-flow-by-period report; the `note` field says so explicitly.
async function getCashCollectedVsInvoiced({ branches, fromDate, toDate }) {
  const match = {
    ...saleDateMatch(fromDate, toDate),
    ...branchMatchStage("branch", branches),
  };

  const result = await Sales.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        invoiced: { $sum: "$amount" },
        collected: { $sum: "$amountPaid" },
      },
    },
  ]);

  const r = result[0] || { invoiced: 0, collected: 0 };

  return {
    invoiced: r.invoiced,
    collected: r.collected,
    outstanding: r.invoiced - r.collected,
    collectionRatePct: r.invoiced > 0 ? round2((r.collected / r.invoiced) * 100) : 0,
    note:
      "\"Collected\" reflects each sale's amountPaid as it stands today, not when the payment " +
      "was actually received. There's no dated payment ledger, so a balance cleared today for " +
      "an older sale counts against that sale's original period, not today.",
  };
}

// Ranks products by revenue or profit over a period. profit per line =
// items.amount - (landedCostAtSale × quantitySold), same formula
// getProfitSummary uses -- works uniformly for pipe and piece lines since
// both populate landedCostAtSale (Phase 1). estimatedShare is the % of a
// product's profit that comes from costEstimated lines specifically (not
// just % of cogs, like getProfitSummary's estimatedCogs) -- it answers
// "how much of *this number* should I not fully trust yet."
async function getTopProducts({ branches, fromDate, toDate, limit = 10, sortBy = "profit" }) {
  const sortField = sortBy === "revenue" ? "revenue" : "profit";
  const match = {
    ...saleDateMatch(fromDate, toDate),
    ...branchMatchStage("branch", branches),
  };

  const results = await Sales.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        unitsSold: { $sum: "$items.quantitySold" },
        revenue: { $sum: "$items.amount" },
        cogs: {
          $sum: {
            $multiply: [{ $ifNull: ["$items.landedCostAtSale", 0] }, "$items.quantitySold"],
          },
        },
        estimatedProfit: {
          $sum: {
            $cond: [
              { $eq: ["$items.costEstimated", true] },
              {
                $subtract: [
                  "$items.amount",
                  { $multiply: [{ $ifNull: ["$items.landedCostAtSale", 0] }, "$items.quantitySold"] },
                ],
              },
              0,
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productInfo",
      },
    },
    { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productId: "$_id",
        productName: { $ifNull: ["$productInfo.name", "Deleted product"] },
        unitsSold: 1,
        revenue: 1,
        profit: { $subtract: ["$revenue", "$cogs"] },
        estimatedProfit: 1,
      },
    },
    { $sort: { [sortField]: -1 } },
    { $limit: limit },
  ]);

  return {
    sortBy: sortField,
    products: results.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      unitsSold: r.unitsSold,
      revenue: round2(r.revenue),
      profit: round2(r.profit),
      estimatedShare: r.profit > 0 ? round2((r.estimatedProfit / r.profit) * 100) : 0,
    })),
  };
}

module.exports = {
  getProfitSummary,
  getInventoryTurnover,
  getDeadStock,
  getRevenueTrend,
  getDebtorAging,
  getCashCollectedVsInvoiced,
  getTopProducts,
};
