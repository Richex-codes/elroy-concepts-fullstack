// Collapses cosmetic differences in how the same product name might get
// typed -- case, spacing, punctuation -- so "50mm Pipe Breach Plug" and
// "50 mm  pipe-breach plug" are recognized as the same product instead of
// silently becoming two separate catalog entries. Mirrored on the client
// (AddProduct.jsx) for the live warning as an admin types; keep both in
// sync if this changes.
function normalizeProductName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

module.exports = { normalizeProductName };
