const mongoose = require("mongoose");

// One Sales document = one transaction/invoice for a customer at a branch.
// A customer can buy several products in the same visit; each is a line
// item in `items`, but the whole transaction shares one branch, one
// amount/amountPaid/balance, and generates one invoice.
const SaleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    // Required for "piece" products, unused for "length" products.
    color: {
      type: String,
      default: "",
    },
    quantitySold: {
      type: Number,
      required: true,
    },
    // Optional unit price. When set, amount = quantitySold * rate; when
    // not, amount is entered directly (e.g. a negotiated lump sum).
    rate: {
      type: Number,
    },
    amount: {
      type: Number,
      required: true,
    },
    // --- cost tracking, "piece" products only (see costConsumption.js) ---
    // Weighted-average unit cost of the batches actually drawn for this line.
    landedCostAtSale: { type: Number },
    // Traceability: which batches (or, for an underflow shortfall, a
    // synthetic null-batchId entry) supplied this line and at what cost.
    costBatchRefs: [
      {
        batchId: { type: mongoose.Schema.Types.ObjectId, default: null },
        quantityDrawn: { type: Number, required: true },
        unitLandedCost: { type: Number, required: true },
        _id: false,
      },
    ],
    // True if any drawn batch (or an underflow shortfall) had an
    // estimated, not real, cost.
    costEstimated: { type: Boolean, default: false },
    // --- "length" (pipe) products only, below ---
    // For cutType "half", the length (in meters) of the stick the staff
    // entered at sale time -- half of it is what was actually sold, and the
    // other half became a remnant. Absent for cutType "full", since a full
    // stick's length was never recorded and isn't needed for anything.
    length: {
      type: Number,
    },
    cutType: {
      type: String,
      enum: ["full", "half"],
    },
    // Provenance of exactly what stock this line drew from, so sale
    // deletion can restore it precisely (undoing any remnant batch it
    // created, restoring the original batches it drew down) instead of
    // guessing. fromLength is only meaningful for a "half" cut drawn from an
    // existing remnant (the remnant's own length); absent otherwise.
    cuts: [
      {
        fromLength: { type: Number },
        pieces: { type: Number, required: true },
        costBatchRefs: [
          {
            batchId: { type: mongoose.Schema.Types.ObjectId, default: null },
            quantityDrawn: { type: Number, required: true },
            unitLandedCost: { type: Number, required: true },
            _id: false,
          },
        ],
        // The remnant batch this cut created (if any), so deletion can
        // undo exactly that batch instead of guessing by length match.
        remnantBatchId: { type: mongoose.Schema.Types.ObjectId, default: null },
        // True for a phantom cut covering an underflow shortfall -- no
        // real stick was ever consumed, so nothing physical to restore.
        isShortfall: { type: Boolean, default: false },
        _id: false,
      },
    ],
  },
  { _id: false }
);

const SalesSchema = new mongoose.Schema({

  customerName: {
    type: String,
    required: true,
  },

  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },

  items: {
    type: [SaleItemSchema],
    required: true,
    validate: {
      validator: (items) => Array.isArray(items) && items.length > 0,
      message: "A sale must have at least one item",
    },
  },

  amount: {
    type: Number,
    required: true,
  },

  amountPaid: {
    type: Number,
    required: true,
    default: 0,
  },

  balance: {
    type: Number,
    required: true,
    default: 0
  },

  saleDate: {
    type: Date,
    default: Date.now,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  // Reconciliation/accountability fields (Phase 4). Deliberately no
  // `required`/`default` at the schema level -- both are enforced instead
  // at the point of creation (routes/admin.js POST /sales), so existing
  // sales that predate this phase read back honestly as "not recorded"
  // instead of silently appearing to have a fabricated value.
  paymentMethod: {
    type: String,
    enum: ["cash", "transfer", "pos", "cheque"],
  },

  // Never trust a client-supplied value for this -- always derived
  // server-side from the authenticated admin (req.user.id) at creation.
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});


// Every sales/debtors listing filters by branch and/or a saleDate range,
// sorted by saleDate descending — these are the two shapes that cover it.
SalesSchema.index({ branch: 1, saleDate: -1 });
SalesSchema.index({ saleDate: -1 });
// Debtors listing always filters on balance > 0 first.
SalesSchema.index({ balance: 1, saleDate: -1 });
// Sale-by-product/color filtering (admin.js GET /sales) uses $elemMatch.
SalesSchema.index({ "items.product": 1 });

module.exports = mongoose.model("Sales", SalesSchema);
