import "./App.css";
import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SignUpPage from "./pages/SignUpPage";
import LoginPage from "./pages/LoginPage";
import ForgottenPassword from "./pages/ForgottenPassword";
import ResetPassPage from "./pages/ResetPassPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import DashboardPage from "./pages/DashboardPage";
import PrivateRoute from "./component/PrivateRoute";
import AdminRoute from "./component/AdminRoute";
import AdminDashboard from "./pages/AdminDashboard";
import ProfilePage from "./pages/ProfilePage";
import ProductCategoryPage from "./pages/ProductCategoryPage";
import CartPage from "./pages/CartPage";
import ProductPage from "./pages/ProductPage";
import { CartProvider } from "./context/CartContext";

function App() {
  return (
    <div className="">
      <CartProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<SignUpPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgottenPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassPage />} />
          <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route
              path="/products/category/:categoryId"
              element={<ProductCategoryPage />}
            />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/products" element={<ProductPage />} />
            {/* admin routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin-dashboard" element={<AdminDashboard />} />
            </Route>
          </Route>
          <Route path="*" element={<h1>404 Not Found</h1>} />
        </Routes>
      </CartProvider>
    </div>
  );
}

export default App;
