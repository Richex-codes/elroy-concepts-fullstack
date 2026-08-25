// Case/spacing/punctuation-insensitive product-name matching -- "50mm Pipe"
// and "50 mm  pipe" collide as the same text here, not just exact matches.
// Mirrors the server's utils/normalizeProductName.js; keep both in sync if
// this changes.
export function normalizeProductName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
