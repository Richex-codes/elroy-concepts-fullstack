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
          required: true,
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
ProductSchema.index({ name: 1 });
// Dashboard "recent inventory" pipeline sorts by this after $unwind.
ProductSchema.index({ "inventory.addedAt": -1 });

module.exports = mongoose.model("Product", ProductSchema);
