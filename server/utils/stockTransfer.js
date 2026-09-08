// Moves stock between two branches -- not a sale (no customer, no revenue),
// just relocating material one branch already owns to another. Deliberately
// separate from Sales/costConsumption's sale-facing functions so a transfer
// can never be mistaken for -- or accidentally counted as -- real income.
//
// Works identically for "piece" and "length" (pipe) products: both draw
// from the same kind of fresh (non-remnant, no length) stock line, so one
// code path serves both. A pipe's remnant offcuts are tied to one specific
// length and aren't meaningful to relocate this way -- transferring "20
// units of this product" only ever touches generic, uncut stock.
const Product = require("../models/productModel");
const { drainLineBatches, findBatchById, restoreStock } = require("./costConsumption.js");

function freshLines(product, branchId, color) {
  return product.inventory.filter(
    (i) => i.branch.toString() === branchId && i.color === color && !i.isRemnant && i.length == null
  );
}

function totalAvailable(product, branchId, color) {
  return freshLines(product, branchId, color).reduce((sum, i) => sum + i.quantity, 0);
}

// Draws `qtyNeeded` units of product+color from fromBranchId's fresh stock
// (FIFO, same drawdown model consumeStock uses for a sale), then creates a
// matching batch at toBranchId carrying over the weighted-average cost of
// whatever was actually drawn -- so a transferred item never loses its cost
// basis or gets silently miscounted as free/estimated stock at the
// receiving branch. Mutates the product in place (caller saves); throws a
// statusCode-tagged error if the sending branch can't fully cover the
// request.
function transferStock(product, fromBranchId, toBranchId, color, qtyNeeded) {
  const lines = freshLines(product, fromBranchId, color);

  let remaining = qtyNeeded;
  let totalCost = 0;
  let drawnQty = 0;
  let costEstimated = false;
  const costBatchRefs = [];

  for (const line of lines) {
    if (remaining <= 0) break;
    const take = Math.min(line.quantity, remaining);
    if (take <= 0) continue;

    const drained = drainLineBatches(line, take);
    totalCost += drained.totalCost;
    drawnQty += drained.drawnQty;
    remaining -= drained.drawnQty;
    if (drained.costEstimated) costEstimated = true;
    costBatchRefs.push(...drained.refs);
    Product.recomputeInventoryQuantity(line);
  }

  if (remaining > 0) {
    throw Object.assign(
      new Error(`Insufficient stock for "${product.name}" (${color}) at the sending branch`),
      { statusCode: 400 }
    );
  }

  const avgCost = drawnQty > 0 ? totalCost / drawnQty : 0;

  let destLine = product.inventory.find(
    (i) => i.branch.toString() === toBranchId && i.color === color && !i.isRemnant && i.length == null
  );
  if (!destLine) {
    product.inventory.push({ branch: toBranchId, color, quantity: 0, batches: [] });
    destLine = product.inventory[product.inventory.length - 1];
  }
  destLine.batches.push({
    quantityReceived: drawnQty,
    quantityRemaining: drawnQty,
    unitLandedCost: avgCost,
    arrivalDate: new Date(),
    costEstimated,
    supplierRef: "",
  });
  Product.recomputeInventoryQuantity(destLine);

  return {
    drawnQty,
    avgCost,
    costEstimated,
    costBatchRefs,
    destBatchId: destLine.batches[destLine.batches.length - 1]._id,
  };
}

// Reverses transferStock for a deleted transfer: claws back whatever's
// still sitting in the batch it created at the receiving branch (tolerant
// of some already having been sold from there since -- same best-effort
// spirit as sale deletion) and restores the exact original batches at the
// sending branch via restoreStock.
function restoreTransfer(product, destBatchId, costBatchRefs) {
  const { line: destLine, batch: destBatch } = findBatchById(product, destBatchId);
  if (destBatch) {
    destBatch.quantityRemaining = 0;
    Product.recomputeInventoryQuantity(destLine);
  }
  restoreStock(product, costBatchRefs);
}

module.exports = { freshLines, totalAvailable, transferStock, restoreTransfer };
