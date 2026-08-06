// FIFO cost consumption for "piece" products, drawing down batches[]
// (server/models/productModel.js) oldest-arrivalDate-first and stamping the
// weighted-average landed cost of whatever was actually drawn. Pipe
// ("length") products are handled separately by pipeStock.js and don't use
// this.

const Product = require("../models/productModel");

// A branch+color can span multiple inventory lines (restocks always push a
// new line rather than merging into an existing one), each usually holding
// one batch -- so FIFO has to pool batches across every matching line, not
// just one line's own array.
function matchingLines(product, branchId, color) {
  return product.inventory.filter(
    (i) => i.branch.toString() === branchId && i.color === color
  );
}

// Draws `qtyNeeded` units of `color` stock for `product` at `branchId`,
// oldest batch first, mutating batches/quantity in place (caller saves).
// Throws a statusCode-tagged error if recorded stock can't fully cover
// `qtyNeeded` -- safe to do mid-mutation since callers run this inside a
// Mongo session transaction, which rolls back every write made on throw.
function consumeStock(product, branchId, color, qtyNeeded) {
  const lines = matchingLines(product, branchId, color);

  const pool = [];
  for (const line of lines) {
    for (const batch of line.batches || []) {
      if (batch.quantityRemaining > 0) pool.push({ line, batch });
    }
  }
  pool.sort((a, b) => new Date(a.batch.arrivalDate) - new Date(b.batch.arrivalDate));

  let remaining = qtyNeeded;
  let totalCost = 0;
  let drawnQty = 0;
  let costEstimated = false;
  const costBatchRefs = [];

  for (const { line, batch } of pool) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityRemaining, remaining);
    if (take <= 0) continue;

    batch.quantityRemaining -= take;
    remaining -= take;
    drawnQty += take;
    totalCost += take * batch.unitLandedCost;
    if (batch.costEstimated) costEstimated = true;
    costBatchRefs.push({
      batchId: batch._id,
      quantityDrawn: take,
      unitLandedCost: batch.unitLandedCost,
    });
    Product.recomputeInventoryQuantity(line);
  }

  if (remaining > 0) {
    throw Object.assign(
      new Error(`Insufficient stock for "${product.name}" (${color})`),
      { statusCode: 400 }
    );
  }

  return {
    landedCostAtSale: drawnQty > 0 ? totalCost / drawnQty : 0,
    costBatchRefs,
    costEstimated,
  };
}

// Draws `unitsNeeded` units from a SINGLE line's own batches, oldest first.
// Used by pipeStock.js, which already picks *which* line to cut from via
// best-fit length matching -- this only handles the cost side of a cut
// already committed to that one line (typically one batch, but drains
// FIFO across more if the same branch+color+length was restocked more than
// once). Unlike consumeStock, this never applies underflow/fallback costing
// itself -- `unmet` tells the caller how much this line couldn't cover, so
// underflow-fallback logic stays in one place (pipeStock.js's own loop).
function drainLineBatches(line, unitsNeeded) {
  const batches = (line.batches || [])
    .filter((b) => b.quantityRemaining > 0)
    .sort((a, b) => new Date(a.arrivalDate) - new Date(b.arrivalDate));

  let remaining = unitsNeeded;
  let totalCost = 0;
  let drawnQty = 0;
  let costEstimated = false;
  let earliestArrival = null;
  const refs = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityRemaining, remaining);
    if (take <= 0) continue;

    batch.quantityRemaining -= take;
    remaining -= take;
    drawnQty += take;
    totalCost += take * batch.unitLandedCost;
    if (batch.costEstimated) costEstimated = true;
    if (!earliestArrival || new Date(batch.arrivalDate) < new Date(earliestArrival)) {
      earliestArrival = batch.arrivalDate;
    }
    refs.push({ batchId: batch._id, quantityDrawn: take, unitLandedCost: batch.unitLandedCost });
  }

  return { drawnQty, totalCost, unmet: remaining, costEstimated, refs, earliestArrival };
}

// Finds a specific batch by id anywhere in a product's inventory, and the
// line that holds it -- used to reverse a cut's cost consumption precisely
// (restore the original batches, undo a remnant's batch) without needing to
// re-derive which line/batch a stale sale record refers to.
function findBatchById(product, batchId) {
  if (!batchId) return { line: null, batch: null };
  for (const line of product.inventory) {
    const batch = (line.batches || []).find((b) => b._id?.toString() === batchId.toString());
    if (batch) return { line, batch };
  }
  return { line: null, batch: null };
}

// Reverses consumeStock for a deleted sale: restores each referenced batch
// by id, precisely, rather than bumping the line's maintained `quantity`
// directly. Mirrors pipeStock.js's restorePipeLength. `quantity` is derived
// from batches[] via recomputeInventoryQuantity (see productModel.js), so
// restoring it any other way leaves quantity and the batches it's supposed
// to summarize out of sync -- a later consumeStock call touching the same
// line recomputes quantity from the still-understated batches and silently
// erases the restoration. Tolerant of a since-deleted batch (best-effort,
// same spirit as the existing restoredCount tolerance elsewhere).
function restoreStock(product, costBatchRefs) {
  let restored = 0;
  for (const ref of costBatchRefs || []) {
    if (!ref.batchId) continue;
    const { line, batch } = findBatchById(product, ref.batchId);
    if (batch) {
      batch.quantityRemaining += ref.quantityDrawn;
      Product.recomputeInventoryQuantity(line);
      restored += ref.quantityDrawn;
    }
  }
  return restored;
}

module.exports = { consumeStock, drainLineBatches, findBatchById, restoreStock };
