const mongoose = require("mongoose");
const { normalizeProductName } = require("../utils/normalizeProductName");
const Schema = mongoose.Schema;

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    // Derived from `name` (case/spacing/punctuation-insensitive) so "50mm
    // Pipe" and "50 mm  pipe" collide as the same product instead of
    // becoming duplicates -- see utils/normalizeProductName.js. Kept in
    // sync by the pre-validate hook below; never set directly.
    normalizedName: {
      type: String,
    },

    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    image: {
      type: String,
      required: false,
    },
    // "piece" = counted normally (existing behaviour). "length" = pipes sold
    // whole ("full") or cut at the point of sale ("half") -- stock isn't
    // tracked by length at all, only by branch+color, the same as "piece"
    // products (see utils/pipeStock.js).
    unitType: {
      type: String,
      enum: ["piece", "length"],
      default: "piece",
    },
    // Only meaningful when unitType === "length". The standard stick length
    // for this pipe -- almost every pipe is 5.8m, but it's editable
    // per-product for the rare one that isn't. A "half" sale defaults to
    // half of this and computes the resulting remnant's length from it, but
    // staff can still type a different piece length at sale time for a
    // one-off custom cut.
    pipeLength: {
      type: Number,
      default: 5.8,
    },
    inventory: [
      {
        branch: {
          type: Schema.Types.ObjectId,
          ref: "Branch",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          default: 0,
        },
        color: {
          type: String,
          default: "",
        },
        // Only ever set on a line with isRemnant: true -- a piece of a known
        // length, either an offcut auto-created from a half-stick sale, or
        // stock an admin restocked directly at a specific length (e.g. pipes
        // that arrived pre-cut). Fresh, length-less stock (for both "piece"
        // and "length" products) never has a length.
        length: {
          type: Number,
        },
        // True for any line carrying a specific length: an offcut
        // auto-created from a half-stick sale, or stock an admin restocked
        // directly at a known length instead of as a full, length-less
        // stick.
        isRemnant: {
          type: Boolean,
          default: false,
        },
        description: {
          type: String,
          default: "",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        // quantity = sum of batches[].quantityRemaining, kept in sync via
        // recomputeInventoryQuantity() below.
        batches: [
          {
            quantityReceived: { type: Number, required: true },
            quantityRemaining: { type: Number, required: true },
            unitLandedCost: { type: Number, default: 0 },
            arrivalDate: { type: Date, default: Date.now },
            costEstimated: { type: Boolean, default: false },
            supplierRef: { type: String, default: "" },
          },
        ],
      },
    ],
    dateAdded:{
      type: Date,
      default: Date.now,
    }
  },
  { timestamps: true }
);

ProductSchema.pre("validate", function (next) {
  if (this.isModified("name") || this.isNew) {
    this.normalizedName = normalizeProductName(this.name);
  }
  next();
});

// Inventory/low-stock/summary aggregations all $unwind inventory then
// $match on branch and/or color; category lookups filter on category too.
ProductSchema.index({ "inventory.branch": 1 });
ProductSchema.index({ category: 1 });
// Case-insensitive unique: without this, two branch admins who've never
// seen each other's stock (e.g. Lekki and Dopemu both creating "30mm pipe"
// for the first time from their own branch's perspective) each get their
// own separate Product document instead of two inventory lines on one --
// splitting a single product's stock/history across duplicates. The
// collation is what makes "30mm Pipe" and "30mm pipe" collide. Explicitly
// named (rather than the default "name_1") so it's created as a genuinely
// new index instead of Mongoose trying to reconcile it with the older
// plain, non-collated index of the same default name -- collation can't be
// changed on an existing index in place, only by dropping and recreating.
ProductSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 }, name: "name_unique_ci" }
);
// Stricter successor to the above: catches spacing/punctuation variants of
// the same name too (e.g. "50mm Pipe" vs "50 mm  pipe"), not just case.
// Kept alongside name_unique_ci rather than replacing it -- both can stay
// since normalizedName-uniqueness is a superset of name-uniqueness, and
// dropping a live unique index is unnecessary risk for no real benefit.
// normalizedName is backfilled on every existing product before this index
// was added (server/backfill_normalized_names.js, run once, not committed)
// -- a unique index built while documents are missing the field would fail
// immediately, since MongoDB treats "missing" as null for indexing purposes.
ProductSchema.index({ normalizedName: 1 }, { unique: true, name: "normalizedName_unique" });
// Dashboard "recent inventory" pipeline sorts by this after $unwind.
ProductSchema.index({ "inventory.addedAt": -1 });

// Not a pre-save hook -- the sales write path mutates quantity directly
// and would get silently reverted by one. Call explicitly on batch changes.
function recomputeInventoryQuantity(line) {
  line.quantity = (line.batches || []).reduce(
    (sum, b) => sum + b.quantityRemaining,
    0
  );
}

const Product = mongoose.model("Product", ProductSchema);
Product.recomputeInventoryQuantity = recomputeInventoryQuantity;

module.exports = Product;
