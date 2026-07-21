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
    color: {
      type: String,
      required: true,
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
