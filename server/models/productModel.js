const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
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
    // by the meter, stocked as discrete sticks (see inventory.length below).
    unitType: {
      type: String,
      enum: ["piece", "length"],
      default: "piece",
    },
    // Only meaningful when unitType === "length".
    pipeShape: { type: String, default: "" },
    pipeSize: { type: String, default: "" },
    pipeThickness: { type: Number },
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
        // Required for "piece" products, unused for "length" products --
        // enforced at the route layer since it's conditional on the parent
        // product's unitType, not expressible as a plain schema constraint.
        color: {
          type: String,
          default: "",
        },
        // Meters per stick in this batch. Only set for "length" products --
        // each line represents a count of physically identical-length
        // sticks, the same way a color line represents identical-color units.
        length: {
          type: Number,
        },
        // True for a line auto-created from a sale's leftover offcut,
        // rather than stock an admin explicitly restocked.
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
      },
    ],
    dateAdded:{
      type: Date,
      default: Date.now,
    }
  },
  { timestamps: true }
);

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
// Dashboard "recent inventory" pipeline sorts by this after $unwind.
ProductSchema.index({ "inventory.addedAt": -1 });

module.exports = mongoose.model("Product", ProductSchema);
