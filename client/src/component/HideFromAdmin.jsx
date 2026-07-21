import { Navigate, Outlet } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

/**
 * The customer storefront is dormant for now — an admin session should
 * never land on it, whether by clicking Logout, typing a URL directly,
 * or following a stale link. Wrap any customer-facing route with this;
 * it sends admin sessions straight to /admin instead.
 */
const HideFromAdmin = () => {
  const token = localStorage.getItem("token");

  if (token) {
    try {
      const decoded = jwtDecode(token);
      if (decoded.isAdmin) {
        return <Navigate to="/admin" replace />;
      }
    } catch (e) {
      // invalid/expired token: let downstream guards (e.g. PrivateRoute) handle it
    }
  }

  return <Outlet />;
};

export default HideFromAdmin;
