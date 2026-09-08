const mongoose = require("mongoose");

// One StockTransfer = material moved from one branch to another -- not a
// sale (no customer, no revenue), just relocating stock the business
// already owns. Deliberately its own collection, not a Sales document with
// a zero amount, so it can never be mistaken for -- or counted toward --
// real income in profit/revenue reporting.
const TransferItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    color: {
      type: String,
      default: "",
    },
    quantity: {
      type: Number,
      required: true,
    },
    // Weighted-average cost of whatever was actually drawn from the
    // sending branch's batches, carried over to the batch created at the
    // receiving branch -- see utils/stockTransfer.js.
    unitLandedCost: { type: Number },
    costEstimated: { type: Boolean, default: false },
    // Traceability for undo: exactly which sending-branch batches this line
    // drew from (restoreTransfer uses this), and the one batch it created
    // at the receiving branch (so undo claws back precisely that, not a
    // guess by product/color match).
    costBatchRefs: [
      {
        batchId: { type: mongoose.Schema.Types.ObjectId, default: null },
        quantityDrawn: { type: Number, required: true },
        unitLandedCost: { type: Number, required: true },
        _id: false,
      },
    ],
    destBatchId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const StockTransferSchema = new mongoose.Schema({
  fromBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },

  toBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },

  items: {
    type: [TransferItemSchema],
    required: true,
    validate: {
      validator: (items) => Array.isArray(items) && items.length > 0,
      message: "A transfer must have at least one item",
    },
  },

  notes: {
    type: String,
    default: "",
  },

  transferDate: {
    type: Date,
    default: Date.now,
  },

  // Never trust a client-supplied value for this -- always derived
  // server-side from the authenticated admin (req.user.id) at creation.
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

StockTransferSchema.index({ fromBranch: 1, transferDate: -1 });
StockTransferSchema.index({ toBranch: 1, transferDate: -1 });
StockTransferSchema.index({ transferDate: -1 });
StockTransferSchema.index({ "items.product": 1 });

module.exports = mongoose.model("StockTransfer", StockTransferSchema);
