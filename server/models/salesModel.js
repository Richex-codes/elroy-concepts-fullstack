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
    // --- "length" (pipe) products only, below ---
    // Length in meters sold per piece (quantitySold counts pieces of this
    // length, same way it counts pieces of a color for "piece" products).
    length: {
      type: Number,
    },
    // Provenance of which original stick lengths this line was cut from,
    // e.g. [{fromLength: 5.8, pieces: 2}, {fromLength: 6, pieces: 1}].
    // Lets sale deletion restore stock (and undo any remnant it created)
    // without needing to store the remnant length redundantly -- it's
    // deterministically fromLength - length, recomputed at restore time.
    cuts: [
      {
        fromLength: { type: Number, required: true },
        pieces: { type: Number, required: true },
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
