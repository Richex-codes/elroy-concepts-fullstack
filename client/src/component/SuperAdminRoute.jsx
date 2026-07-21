import { Navigate, Outlet } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

// Stricter than AdminRoute: only role "superadmin" passes. Branch-scoped
// admins are still admins (AdminRoute already let them through) but must
// not reach superadmin-only pages like Make Admin or the audit log by
// typing the URL directly, even though the nav link is already hidden
// for them.
const SuperAdminRoute = () => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;

  const decoded = jwtDecode(token);
  return decoded.role === "superadmin" ? <Outlet /> : <Navigate to="/unauthorized" />;
};

export default SuperAdminRoute;
