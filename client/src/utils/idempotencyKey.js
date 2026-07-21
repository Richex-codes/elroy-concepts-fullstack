// One key per "attempt to submit this specific form." Sent as the
// Idempotency-Key header so a duplicate request (double-click that slips
// past the disabled-button guard, a resubmit after a lost response) gets
// replayed by the server instead of creating a second sale/product/etc.
// Rotate to a fresh key after a successful submit; keep the same one on
// failure so a manual retry of the same action is still deduped correctly.
export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
