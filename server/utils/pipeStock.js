// Stock deduction/restoration for "length" (pipe) products. Fresh stock
// isn't tracked by length at all -- how long a stick happens to be doesn't
// matter until someone wants to cut it. Pipes are sold two ways:
//
//   "full": sell a whole stick, no length involved anywhere.
//   "half": staff enter the PIECE length being sold (defaulting, in the UI,
//     to half of the product's standard pipeLength -- but freely editable
//     for a one-off custom cut, e.g. a 1.2m caterpillar-pipe piece). The
//     resulting remnant's length is computed from the product's own
//     pipeLength, not asked for separately. That remnant IS a specific,
//     known-length leftover from then on -- it's the only kind of
//     inventory line that ever carries a real `length` value.
//
// A "half" request first uses up any existing remnant already sitting at
// exactly that piece length (a leftover from an earlier cut), and only
// cuts a fresh (length-less) stick once those run out.
//
// Cost: within whichever line(s) match, drawn FIFO (oldest arrivalDate
// first) via drainLineBatches, same cost model as piece products'
// consumeStock. A remnant inherits the weighted-average cost of the stick
// it came from -- cutting a stick doesn't change its cost basis.

const Product = require("../models/productModel");
const { drainLineBatches, findBatchById } = require("./costConsumption.js");

// A remnant this short wouldn't be a usable sellable piece -- treated as
// scrap instead of a new inventory line.
const PIPE_REMNANT_MIN_LENGTH = 0.3;

// Guards against float noise (e.g. 5.8 - 2.9 landing on
// 2.9000000000000004) so a remnant created now is found again by exact
// match later, instead of silently fragmenting into near-duplicate lines.
function round2(n) {
  return Math.round(n * 100) / 100;
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

// Remnant lines at exactly `length` -- the only inventory lines that ever
// carry a real length value.
function remnantLinesAt(product, branchId, color, length) {
  return product.inventory.filter(
    (i) =>
      i.branch.toString() === branchId &&
      i.color === color &&
      i.isRemnant &&
      i.length === length &&
      i.quantity > 0
  );
}

// Fresh stock: no length recorded (never asked for at stock-in time), not a
// remnant. This is what "full" sales draw from, and what "half" sales fall
// back to cutting once matching remnants run out.
function genericFreshLines(product, branchId, color) {
  return product.inventory.filter(
    (i) =>
      i.branch.toString() === branchId &&
      i.color === color &&
      !i.isRemnant &&
      i.length == null &&
      i.quantity > 0
  );
}

// Total pieces sellable for the given cutType. "full" only ever counts
// length-less fresh stock. "half" needs `pieceLength` (the length the
// caller intends to sell -- not the stick it comes from) and counts both a
// matching existing remnant and fresh stock that could still be cut to
// produce one.
function availablePieces(product, branchId, color, cutType, pieceLength) {
  if (cutType !== "half") {
    return genericFreshLines(product, branchId, color).reduce((sum, i) => sum + i.quantity, 0);
  }
  const remnant = remnantLinesAt(product, branchId, color, round2(pieceLength)).reduce(
    (sum, i) => sum + i.quantity,
    0
  );
  const fresh = genericFreshLines(product, branchId, color).reduce((sum, i) => sum + i.quantity, 0);
  return remnant + fresh;
}

// Sells `piecesNeeded` pieces. Mutates the product in place (caller saves).
// Throws a statusCode-tagged error if stock can't fully cover the request
// -- safe mid-mutation since callers run this inside a Mongo session
// transaction, which rolls back every write made on throw.
//
// cutType "full": pieceLength is ignored. Draws only from length-less fresh
// stock -- there's nothing to cut, nothing to record.
//
// cutType "half": pieceLength is required (the length being sold, entered
// by staff right now). Draws down any existing remnant at exactly that
// length first, then cuts fresh sticks for the remainder -- each cut
// leaves a new remnant sized product.pipeLength - pieceLength.
function deductPipePieces(product, branchId, color, cutType, piecesNeeded, pieceLength) {
  const cuts = [];
  let remaining = piecesNeeded;
  let totalCost = 0;
  let drawnQty = 0;
  let costEstimated = false;
  const targetLength = cutType === "half" ? round2(pieceLength) : null;

  if (cutType === "half") {
    for (const line of remnantLinesAt(product, branchId, color, targetLength)) {
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
        fromLength: targetLength,
        pieces: drained.drawnQty,
        costBatchRefs: drained.refs,
        remnantBatchId: null,
      });
    }
  }

  if (remaining > 0) {
    // Cutting a fresh (never-cut) stick: the leftover is the product's own
    // known standard length minus the piece just sold.
    const remnantLength = cutType === "half" ? round2(product.pipeLength - targetLength) : null;

    for (const line of genericFreshLines(product, branchId, color)) {
      if (remaining <= 0) break;
      const take = Math.min(line.quantity, remaining);
      if (take <= 0) continue;

      const drained = drainLineBatches(line, take);
      totalCost += drained.totalCost;
      drawnQty += drained.drawnQty;
      remaining -= drained.drawnQty;
      if (drained.costEstimated) costEstimated = true;
      Product.recomputeInventoryQuantity(line);

      let remnantBatchId = null;
      if (cutType === "half" && remnantLength >= PIPE_REMNANT_MIN_LENGTH) {
        const avgCost = drained.drawnQty > 0 ? drained.totalCost / drained.drawnQty : 0;
        remnantBatchId = addRemnant(
          product,
          branchId,
          color,
          remnantLength,
          drained.drawnQty,
          avgCost,
          drained.costEstimated,
          drained.earliestArrival || new Date()
        );
      }

      cuts.push({
        fromLength: cutType === "half" ? targetLength : null,
        pieces: drained.drawnQty,
        costBatchRefs: drained.refs,
        remnantBatchId,
      });
    }
  }

  if (remaining > 0) {
    const label = cutType === "half" ? `piece at ${targetLength}m` : "full stick";
    throw Object.assign(
      new Error(`Insufficient stock for "${product.name}" (${color}) -- ${label}`),
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
