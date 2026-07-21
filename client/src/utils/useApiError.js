import { useState, useCallback, useRef } from "react";

// Surfaces a server's rejection message (e.g. a 403 "not your branch") as a
// dismissible banner instead of silently failing with just a
// console.error -- the user needs to know *why* the data didn't load.
export function useApiError() {
  const [error, setError] = useState("");
  const clearTimer = useRef(null);

  const showError = useCallback((err, fallback = "Something went wrong. Please try again.") => {
    clearTimeout(clearTimer.current);
    const msg = err?.response?.data?.message || err?.response?.data?.msg || fallback;
    setError(msg);
    clearTimer.current = setTimeout(() => setError(""), 6000);
  }, []);

  const clearError = useCallback(() => {
    clearTimeout(clearTimer.current);
    setError("");
  }, []);

  return { error, showError, clearError };
}
