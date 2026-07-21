import { Suspense } from "react";
import "./App.css";
import { Route, Routes, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SignUpPage from "./pages/SignUpPage";
import LoginPage from "./pages/LoginPage";
import ForgottenPassword from "./pages/ForgottenPassword";
import ResetPassPage from "./pages/ResetPassPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import DashboardPage from "./pages/DashboardPage";
import PrivateRoute from "./component/PrivateRoute";
import AdminRoute from "./component/AdminRoute";
import SuperAdminRoute from "./component/SuperAdminRoute";
import HideFromAdmin from "./component/HideFromAdmin";
import AdminDashboard from "./pages/AdminDashboard";
import ProfilePage from "./pages/ProfilePage";
import ProductCategoryPage from "./pages/ProductCategoryPage";
import CartPage from "./pages/CartPage";
import ProductPage from "./pages/ProductPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { CartProvider } from "./context/CartContext";
import { ADMIN_NAV_ITEMS } from "./adminNav";

function AdminSectionLoading() {
  return <div className="admin-section-loading">Loading…</div>;
}

function App() {
  return (
    <div className="app-wrapper">
      <CartProvider>
        <Routes>
          {/* Admin ERP is the primary product for now; the customer
              storefront is dormant but kept reachable at /home rather
              than removed, so it can be reactivated with zero rework. */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route element={<HideFromAdmin />}>
            <Route path="/home" element={<HomePage />} />
          </Route>
          <Route path="/register" element={<SignUpPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgottenPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassPage />} />
          <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route element={<PrivateRoute />}>
            <Route element={<HideFromAdmin />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route
                path="/products/category/:categoryId"
                element={<ProductCategoryPage />}
              />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/products" element={<ProductPage />} />
            </Route>
            {/* admin routes -- each nav section is its own routed page
                (bookmarkable, works with browser back/forward) rendered
                through AdminDashboard's <Outlet />, instead of one page
                that swaps content via local state. */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />}>
                {ADMIN_NAV_ITEMS.filter((item) => !item.superAdminOnly).map((item) => (
                  <Route
                    key={item.key}
                    {...(item.path === "" ? { index: true } : { path: item.path })}
                    element={
                      <Suspense fallback={<AdminSectionLoading />}>
                        <item.Component />
                      </Suspense>
                    }
                  />
                ))}
                {/* Superadmin-only sections (Make Admin, Audit Log) get an
                    extra route-level guard so a branch admin can't reach
                    them by typing the URL directly, even with the nav
                    link already hidden. */}
                <Route element={<SuperAdminRoute />}>
                  {ADMIN_NAV_ITEMS.filter((item) => item.superAdminOnly).map((item) => (
                    <Route
                      key={item.key}
                      path={item.path}
                      element={
                        <Suspense fallback={<AdminSectionLoading />}>
                          <item.Component />
                        </Suspense>
                      }
                    />
                  ))}
                </Route>
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<h1>404 Not Found</h1>} />
        </Routes>
      </CartProvider>
    </div>
  );
}

export default App;
