// Stock deduction/restoration for "length" (pipe) products, where a single
// physical stick can be cut, sold in part, and leave a sellable offcut
// ("remnant") behind. Mirrors the color-based deduction pattern in
// routes/admin.js POST /sales (filter matching lines, drain across them,
// save once) but keyed by branch+color+length, with the added wrinkle of a
// cut creating new stock rather than just consuming it.
//
// Cost: line SELECTION is still best-fit-by-length (unchanged) -- but once
// a line is chosen, the cost of the sticks cut from it is drawn FIFO
// (oldest arrivalDate first) across that line's own batches via
// drainLineBatches, same cost model as piece products' consumeStock. A
// remnant inherits the weighted-average cost of the stick(s) it was cut
// from -- cutting a stick doesn't change its cost basis.

const Product = require("../models/productModel");
const { drainLineBatches, findBatchById } = require("./costConsumption.js");

// Leftover shorter than this isn't worth restocking as a sellable piece --
// it's recorded as scrap instead of becoming a new inventory line.
const PIPE_REMNANT_MIN_LENGTH = 0.3;

// Millimeter precision avoids floating-point noise (e.g. 5.8 - 2 !== 3.8)
// turning into spurious near-duplicate remnant lines.
function round(n) {
  return Math.round(n * 1000) / 1000;
}

// Sticks long enough to yield a piece of `requestedLength`, shortest first
// -- best-fit, so a cut always comes off the smallest stick that still
// works, minimizing leftover waste instead of eating into long stock first.
function eligiblePipeLines(product, branchId, color, requestedLength) {
  return product.inventory
    .filter(
      (i) =>
        i.branch.toString() === branchId &&
        i.color === color &&
        i.length != null &&
        i.length >= requestedLength &&
        i.quantity > 0
    )
    .sort((a, b) => a.length - b.length);
}

function findOrCreateRemnantLine(product, branchId, color, length) {
  let line = product.inventory.find(
    (i) => i.branch.toString() === branchId && i.color === color && i.isRemnant && i.length === length
  );
  if (!line) {
    product.inventory.push({
      branch: branchId,
      color,
      length,
      quantity: 0,
      isRemnant: true,
      description: "Offcut from a sale",
      batches: [],
    });
    line = product.inventory[product.inventory.length - 1];
  }
  return line;
}

// Creates a new batch on the remnant line carrying the cut stick's cost.
// Returns the new batch's id, so the sale record can reverse exactly this
// batch later instead of guessing by length match.
function addRemnant(product, branchId, color, length, pieces, unitLandedCost, costEstimated, arrivalDate) {
  const line = findOrCreateRemnantLine(product, branchId, color, length);
  line.batches.push({
    quantityReceived: pieces,
    quantityRemaining: pieces,
    unitLandedCost,
    arrivalDate,
    costEstimated,
    supplierRef: "",
  });
  const newBatch = line.batches[line.batches.length - 1];
  Product.recomputeInventoryQuantity(line);
  return newBatch._id;
}

// Drains `piecesNeeded` pieces of `requestedLength` off the product's own
// inventory (mutates in place, caller is responsible for saving), creating
// remnant lines for any cut that leaves a usable offcut, and stamping cost
// data drawn from each cut line's own batches. Throws a statusCode-tagged
// error if recorded stick stock can't fully cover `piecesNeeded` -- safe to
// do mid-mutation since callers run this inside a Mongo session
// transaction, which rolls back every write made on throw.
//
// Re-reads live inventory (via eligiblePipeLines) rather than trusting a
// pre-computed total, so it stays correct even when an earlier line item in
// the same sale already drew down an overlapping stick (e.g. a 6m stick is
// eligible for both a 2m request and a 3m request in the same cart).
function deductPipeLength(product, branchId, color, requestedLength, piecesNeeded) {
  const lines = eligiblePipeLines(product, branchId, color, requestedLength);

  let remaining = piecesNeeded;
  const cuts = [];
  let totalCost = 0;
  let drawnQty = 0;
  let costEstimated = false;

  for (const line of lines) {
    if (remaining <= 0) break;
    const take = Math.min(line.quantity, remaining);
    if (take <= 0) continue;

    remaining -= take;

    const drained = drainLineBatches(line, take);
    totalCost += drained.totalCost;
    drawnQty += drained.drawnQty;
    if (drained.costEstimated) costEstimated = true;
    Product.recomputeInventoryQuantity(line);

    const leftover = round(line.length - requestedLength);
    let remnantBatchId = null;
    if (leftover >= PIPE_REMNANT_MIN_LENGTH) {
      const avgCost = drained.drawnQty > 0 ? drained.totalCost / drained.drawnQty : 0;
      remnantBatchId = addRemnant(
        product,
        branchId,
        color,
        leftover,
        take,
        avgCost,
        drained.costEstimated,
        drained.earliestArrival || new Date()
      );
    }

    cuts.push({
      fromLength: line.length,
      pieces: take,
      costBatchRefs: drained.refs,
      remnantBatchId,
    });
  }

  if (remaining > 0) {
    throw Object.assign(
      new Error(`Insufficient stock for "${product.name}" (${color}) at ${requestedLength}m`),
      { statusCode: 400 }
    );
  }

  return {
    cuts,
    landedCostAtSale: drawnQty > 0 ? totalCost / drawnQty : 0,
    costBatchRefs: cuts.flatMap((c) => c.costBatchRefs),
    costEstimated,
  };
}

// Reverses deductPipeLength for a deleted sale: for each cut, undoes the
// remnant batch it created (if any) and restores the original batches it
// drew from -- precisely, by batch id, rather than guessing by length
// match. Shortfall cuts (isShortfall) never consumed a real stick, so
// there's nothing physical to restore for them. Tolerant of a batch/line
// having since been deleted (best-effort, same spirit as the existing
// restoredCount/totalItems tolerance on the color-based delete path).
function restorePipeLength(product, branchId, color, requestedLength, cuts) {
  let restored = 0;

  for (const cut of cuts) {
    const { pieces, costBatchRefs, remnantBatchId, isShortfall } = cut;

    if (remnantBatchId) {
      const { line: remnantLine, batch: remnantBatch } = findBatchById(product, remnantBatchId);
      if (remnantBatch) {
        remnantBatch.quantityRemaining = Math.max(0, remnantBatch.quantityRemaining - pieces);
        Product.recomputeInventoryQuantity(remnantLine);
      }
    }

    if (!isShortfall) {
      for (const ref of costBatchRefs || []) {
        if (!ref.batchId) continue;
        const { line: originalLine, batch: originalBatch } = findBatchById(product, ref.batchId);
        if (originalBatch) {
          originalBatch.quantityRemaining += ref.quantityDrawn;
          Product.recomputeInventoryQuantity(originalLine);
        }
      }
    }

    restored += pieces;
  }

  return restored;
}

module.exports = {
  PIPE_REMNANT_MIN_LENGTH,
  eligiblePipeLines,
  deductPipeLength,
  restorePipeLength,
};
