// Stock deduction/restoration for "length" (pipe) products, where a single
// physical stick can be cut, sold in part, and leave a sellable offcut
// ("remnant") behind. Mirrors the color-based deduction pattern in
// routes/admin.js POST /sales (filter matching lines, drain across them,
// save once) but keyed by length instead of an exact color match, and with
// the added wrinkle of a cut creating new stock rather than just consuming it.

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
function eligiblePipeLines(product, branchId, requestedLength) {
  return product.inventory
    .filter(
      (i) =>
        i.branch.toString() === branchId &&
        i.length != null &&
        i.length >= requestedLength &&
        i.quantity > 0
    )
    .sort((a, b) => a.length - b.length);
}

function addRemnant(product, branchId, length, pieces) {
  const existing = product.inventory.find(
    (i) => i.branch.toString() === branchId && i.isRemnant && i.length === length
  );
  if (existing) {
    existing.quantity += pieces;
  } else {
    product.inventory.push({
      branch: branchId,
      length,
      quantity: pieces,
      isRemnant: true,
      color: "",
      description: "Offcut from a sale",
    });
  }
}

// Drains `piecesNeeded` pieces of `requestedLength` off the product's own
// inventory (mutates in place, caller is responsible for saving), creating
// remnant lines for any cut that leaves a usable offcut. Throws a
// statusCode-tagged error if stock runs out partway through -- safe to do
// mid-mutation since callers run this inside a Mongo session transaction,
// which rolls back every write made in the callback on throw.
//
// Re-reads live inventory (via eligiblePipeLines) rather than trusting a
// pre-computed total, so it stays correct even when an earlier line item in
// the same sale already drew down an overlapping stick (e.g. a 6m stick is
// eligible for both a 2m request and a 3m request in the same cart).
function deductPipeLength(product, branchId, requestedLength, piecesNeeded) {
  const lines = eligiblePipeLines(product, branchId, requestedLength);

  let remaining = piecesNeeded;
  const cuts = [];
  for (const line of lines) {
    if (remaining <= 0) break;
    const take = Math.min(line.quantity, remaining);
    if (take <= 0) continue;

    line.quantity -= take;
    remaining -= take;
    cuts.push({ fromLength: line.length, pieces: take });

    const leftover = round(line.length - requestedLength);
    if (leftover >= PIPE_REMNANT_MIN_LENGTH) {
      addRemnant(product, branchId, leftover, take);
    }
  }

  if (remaining > 0) {
    throw Object.assign(
      new Error(`Insufficient stock for "${product.name}" at ${requestedLength}m`),
      { statusCode: 400 }
    );
  }

  return cuts;
}

// Reverses deductPipeLength for a deleted sale. For each recorded cut,
// deterministically recomputes the remnant length it would have created
// (fromLength - requestedLength) and removes that many pieces from it --
// clamped at whatever's actually left, in case the remnant was itself
// already partially resold -- then restores `pieces` back onto the
// original fromLength line (recreating it if it's since been fully drained
// away). Returns how many pieces were restored, for audit metadata, same
// spirit as the existing restoredCount/totalItems tolerance on the
// color-based delete path.
function restorePipeLength(product, branchId, requestedLength, cuts) {
  let restored = 0;

  for (const { fromLength, pieces } of cuts) {
    const leftover = round(fromLength - requestedLength);
    if (leftover >= PIPE_REMNANT_MIN_LENGTH) {
      const remnant = product.inventory.find(
        (i) => i.branch.toString() === branchId && i.isRemnant && i.length === leftover
      );
      if (remnant) {
        remnant.quantity = Math.max(0, remnant.quantity - pieces);
      }
    }

    const original = product.inventory.find(
      (i) => i.branch.toString() === branchId && !i.isRemnant && i.length === fromLength
    );
    if (original) {
      original.quantity += pieces;
    } else {
      product.inventory.push({
        branch: branchId,
        length: fromLength,
        quantity: pieces,
        isRemnant: false,
        color: "",
        description: "Restored from a deleted sale",
      });
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
