import { Navigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

// "/" used to send everyone to /login unconditionally, even someone who
// still had a valid session -- closing the tab and typing the address
// again shouldn't ask them to log back in a second time. Same
// decode-and-check-exp as PrivateRoute, and the same admin-vs-customer
// destination LoginPage.js already sends people to right after logging in.
export default function RootRedirect() {
  const token = localStorage.getItem("token");

  if (token) {
    try {
      const decoded = jwtDecode(token);
      const currentTime = Date.now() / 1000;
      if (decoded.exp > currentTime) {
        return <Navigate to={decoded.isAdmin ? "/admin" : "/dashboard"} replace />;
      }
    } catch (e) {
      console.error("Invalid token:", e);
    }
  }

  return <Navigate to="/login" replace />;
}
