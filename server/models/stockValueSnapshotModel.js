const mongoose = require("mongoose");

// One row per branch per day: that branch's total stock value (Σ
// quantityRemaining × unitLandedCost across every batch) as of whenever the
// nightly snapshot cron ran. This is what lets getInventoryTurnover
// (analyticsUtils.js) average stock value across a real date range instead
// of relying on a single "right now" snapshot for every query -- see
// stockValueSnapshotTask.js for how these get written.
const StockValueSnapshotSchema = new mongoose.Schema({
  date: { type: Date, required: true }, // midnight UTC of the day this snapshot represents
  branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
  stockValue: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// One snapshot per branch per day -- the cron upserts on this, so a re-run
// on the same day (e.g. after a PM2 restart) overwrites instead of
// duplicating.
StockValueSnapshotSchema.index({ date: 1, branch: 1 }, { unique: true });

module.exports = mongoose.model("StockValueSnapshot", StockValueSnapshotSchema);
