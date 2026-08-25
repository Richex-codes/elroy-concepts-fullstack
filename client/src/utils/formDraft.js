// Lets an in-progress form (not yet submitted) survive the admin
// navigating away -- to check the dashboard, another tab, etc. -- and
// coming back. Backed by sessionStorage rather than localStorage: it
// should feel like "this browser tab still has your unfinished form", not
// persist indefinitely across days/devices, and it naturally clears itself
// when the tab closes.
const PREFIX = "formDraft:";

export function loadDraft(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw != null ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(key, data) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch {
    // Storage full/unavailable (private browsing, etc.) -- losing draft
    // persistence isn't worth failing the form over.
  }
}

export function clearDraft(key) {
  sessionStorage.removeItem(PREFIX + key);
}

// Called on logout so one admin's half-finished form can't leak into the
// next person's session on a shared browser/computer.
export function clearAllDrafts() {
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  }
}
