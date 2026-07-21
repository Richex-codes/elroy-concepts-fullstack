import { jwtDecode } from "jwt-decode";

// Single source of truth for reading the logged-in user's role/branch off
// their token -- every admin page that needs to know "am I a superadmin?"
// or "what's my branch?" should go through this instead of decoding the
// token itself, so that logic can't drift between call sites.
export function getCurrentUser() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

export function isSuperAdmin(user = getCurrentUser()) {
  return user?.role === "superadmin";
}

// A branch admin can now hold more than one branch. Always [] for a
// superadmin/customer (superadmins aren't restricted to any branch list).
export function getOwnBranchIds(user = getCurrentUser()) {
  if (!user || isSuperAdmin(user)) return [];
  return Array.isArray(user.adminBranches) ? user.adminBranches : [];
}

// First of the admin's branches, or "" for a superadmin/customer -- use
// this as the *default* value for a single-select branch filter so it
// lands on one of the admin's own branches first, while superadmins still
// default to "" (All Branches). If they hold more than one branch, the
// dropdown itself still lets them switch between all of them.
export function getOwnBranchId(user = getCurrentUser()) {
  return getOwnBranchIds(user)[0] || "";
}

// True if this branch is one the admin is allowed to act on -- always true
// for a superadmin (unrestricted) or a customer (nothing to restrict).
export function isOwnBranch(branchId, user = getCurrentUser()) {
  if (!user || isSuperAdmin(user)) return true;
  return getOwnBranchIds(user).includes(branchId);
}
