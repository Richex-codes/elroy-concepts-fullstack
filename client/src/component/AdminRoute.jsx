import { Navigate, Outlet } from "react-router-dom";
import { jwtDecode } from "jwt-decode";


const AdminRoute = () => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace/>;

  const decoded = jwtDecode(token);
  return decoded.isAdmin ? <Outlet/> : <Navigate to="/unauthorized" />;
};

export default AdminRoute;
