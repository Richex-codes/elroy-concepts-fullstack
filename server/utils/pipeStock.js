// Stock deduction/restoration for "length" (pipe) products. Pipes are only
// ever sold as a FULL stick (its own length, whatever that happens to be --
// different delivery batches can be different lengths, e.g. 6m vs 5.8m) or
// exactly HALF of one, never a custom cut. That means matching is always
// exact-length, never best-fit: a "full" request only ever draws stock
// already at that exact length, and a "half" request draws stock already at
// that exact (half) length first, only cutting a fresh stick -- at exactly
// double that length -- once those run out.
//
// Cost: within whichever line(s) match, drawn FIFO (oldest arrivalDate
// first) via drainLineBatches, same cost model as piece products'
// consumeStock. A remnant (the other half of a freshly cut stick) inherits
// the weighted-average cost of the stick it came from -- cutting a stick
// doesn't change its cost basis.

const Product = require("../models/productModel");
const { drainLineBatches, findBatchById } = require("./costConsumption.js");

// A half this short wouldn't be a usable sellable piece -- treated as scrap
// instead of a new inventory line. In practice, since pipes are only ever
// sold whole or exactly halved, this only bites for unusually short stock.
const PIPE_REMNANT_MIN_LENGTH = 0.3;

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
      description: "Offcut from a half-stick sale",
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

// Every inventory line at exactly `length` for this branch+color, with
// stock remaining. No best-fit fuzziness -- a stick of a different length
// is a physically different piece, not a substitute.
function exactLengthLines(product, branchId, color, length) {
  return product.inventory.filter(
    (i) =>
      i.branch.toString() === branchId &&
      i.color === color &&
      i.length === length &&
      i.quantity > 0
  );
}

// Total pieces sellable at `pieceLength` for the given cutType: exact-length
// stock on hand, plus -- for "half" only -- stock at double that length
// that could still be cut. Used for a pre-flight check before the
// transaction and for the post-sale low-stock check.
function availablePieces(product, branchId, color, pieceLength, cutType) {
  const exact = exactLengthLines(product, branchId, color, pieceLength).reduce((sum, i) => sum + i.quantity, 0);
  if (cutType !== "half") return exact;
  const parent = exactLengthLines(product, branchId, color, pieceLength * 2).reduce((sum, i) => sum + i.quantity, 0);
  return exact + parent;
}

// Sells `piecesNeeded` pieces of length `pieceLength` (a full stick's own
// length, or exactly half of it). Mutates the product in place (caller
// saves). Throws a statusCode-tagged error if stock can't fully cover the
// request -- safe mid-mutation since callers run this inside a Mongo
// session transaction, which rolls back every write made on throw.
//
// cutType "full": only ever draws from stock already at exactly
// pieceLength. Never cuts a longer stick down -- "full" means the entire
// original stick, not a custom-sized piece of a bigger one.
//
// cutType "half": first draws down any stock already at exactly
// pieceLength (fresh stock naturally at that length, or a leftover half
// from an earlier half-stick sale). Only once that's exhausted does it cut
// a fresh stick -- drawn from stock at exactly pieceLength × 2 -- splitting
// each one into the sold half and a remnant half of the same length.
function deductPipePieces(product, branchId, color, pieceLength, cutType, piecesNeeded) {
  const cuts = [];
  let remaining = piecesNeeded;
  let totalCost = 0;
  let drawnQty = 0;
  let costEstimated = false;

  for (const line of exactLengthLines(product, branchId, color, pieceLength)) {
    if (remaining <= 0) break;
    const take = Math.min(line.quantity, remaining);
    if (take <= 0) continue;

    const drained = drainLineBatches(line, take);
    totalCost += drained.totalCost;
    drawnQty += drained.drawnQty;
    remaining -= drained.drawnQty;
    if (drained.costEstimated) costEstimated = true;
    Product.recomputeInventoryQuantity(line);

    cuts.push({
      fromLength: pieceLength,
      pieces: drained.drawnQty,
      costBatchRefs: drained.refs,
      remnantBatchId: null,
    });
  }

  if (remaining > 0 && cutType === "half") {
    const parentLength = pieceLength * 2;

    for (const line of exactLengthLines(product, branchId, color, parentLength)) {
      if (remaining <= 0) break;
      const take = Math.min(line.quantity, remaining);
      if (take <= 0) continue;

      const drained = drainLineBatches(line, take);
      totalCost += drained.totalCost;
      drawnQty += drained.drawnQty;
      remaining -= drained.drawnQty;
      if (drained.costEstimated) costEstimated = true;
      Product.recomputeInventoryQuantity(line);

      const avgCost = drained.drawnQty > 0 ? drained.totalCost / drained.drawnQty : 0;
      let remnantBatchId = null;
      if (pieceLength >= PIPE_REMNANT_MIN_LENGTH) {
        remnantBatchId = addRemnant(
          product,
          branchId,
          color,
          pieceLength,
          drained.drawnQty,
          avgCost,
          drained.costEstimated,
          drained.earliestArrival || new Date()
        );
      }

      cuts.push({
        fromLength: parentLength,
        pieces: drained.drawnQty,
        costBatchRefs: drained.refs,
        remnantBatchId,
      });
    }
  }

  if (remaining > 0) {
    const label = cutType === "half" ? "half stick" : "full stick";
    throw Object.assign(
      new Error(`Insufficient stock for "${product.name}" (${color}) -- ${label} at ${pieceLength}m`),
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

// Reverses deductPipePieces for a deleted sale: for each cut, undoes the
// remnant batch it created (if any) and restores the original batches it
// drew from -- precisely, by batch id, rather than guessing by length
// match. Mirrors costConsumption.js's restoreStock. Tolerant of a
// batch/line having since been deleted (best-effort, same spirit as the
// existing restoredCount/totalItems tolerance on the color-based delete
// path).
function restorePipePieces(product, cuts) {
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
  availablePieces,
  deductPipePieces,
  restorePipePieces,
};
