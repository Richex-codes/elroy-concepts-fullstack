// One-time migration: wraps each inventory line's existing quantity in a
// single batches[] entry. Never changes quantity itself.
//
// Usage:
//   node scripts/migrate-inventory-batches.js --dry-run
//   node scripts/migrate-inventory-batches.js --commit
//
// Back up the database before running --commit.

require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/productModel");
const Branch = require("../models/branchesModel");

const COMMIT = process.argv.includes("--commit");

function branchTotals(products) {
  const totals = new Map();
  for (const product of products) {
    for (const line of product.inventory) {
      const key = line.branch.toString();
      totals.set(key, (totals.get(key) || 0) + (line.quantity || 0));
    }
  }
  return totals;
}

async function printTotals(label, totals) {
  const branches = await Branch.find({});
  const nameById = new Map(branches.map((b) => [b._id.toString(), b.name]));
  console.log(label);
  let grand = 0;
  for (const [branchId, total] of [...totals.entries()].sort()) {
    console.log(`  ${nameById.get(branchId) || branchId}: ${total}`);
    grand += total;
  }
  console.log(`  TOTAL: ${grand}`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(COMMIT ? "COMMIT run\n" : "DRY RUN (no writes)\n");

  const products = await Product.find({});
  const before = branchTotals(products);

  let toMigrate = 0;
  let alreadyMigrated = 0;

  for (const product of products) {
    for (const line of product.inventory) {
      if (line.batches && line.batches.length > 0) {
        alreadyMigrated++;
        continue;
      }
      toMigrate++;
      if (COMMIT) {
        const qty = line.quantity || 0;
        line.batches = [
          {
            quantityReceived: qty,
            quantityRemaining: qty,
            unitLandedCost: 0,
            arrivalDate: line.addedAt || product.createdAt || new Date(),
            costEstimated: true,
            supplierRef: "",
          },
        ];
      }
    }
  }

  console.log(`Entries to migrate: ${toMigrate}`);
  console.log(`Entries already migrated (skipped): ${alreadyMigrated}\n`);
  await printTotals("Per-branch totals BEFORE:", before);

  if (!COMMIT) {
    console.log("\nDry run complete. No changes written. Pass --commit to apply.");
    await mongoose.disconnect();
    return;
  }

  const after = branchTotals(products);
  const changed = [...before.entries()].some(([id, total]) => after.get(id) !== total);
  if (changed) {
    console.error("\nABORT: per-branch totals changed. Nothing saved.");
    await printTotals("BEFORE:", before);
    await printTotals("AFTER:", after);
    await mongoose.disconnect();
    process.exit(1);
  }

  for (const product of products) {
    await product.save();
  }

  console.log("\nSaved.");
  await printTotals("Per-branch totals AFTER:", after);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
