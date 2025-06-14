import React, { useState } from "react";
import "../styles/AdminDashboard.css";
import ProductList from "../component/ProductList";
import AddProduct from "../component/AddProduct.jsx";
import CategoryManager from "../component/CategoryManager.jsx";
import DashboardSummary from "../component/DashboardSummary.jsx";
import Inventory from "../component/Inventory.jsx";
import AddInventoryPage from "../component/AddInventory.jsx";
import Enquiries from "../component/Enquiries.jsx";
import { useNavigate } from "react-router-dom";

export default function AdminDashboardPage() {
  const [view, setView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const renderView = () => {
    switch (view) {
      case "products":
        return <ProductList />;
      case "add-product":
        return <AddProduct />;
      case "categories":
        return <CategoryManager />;
      case "inventory":
        return <Inventory />;
      case "add-inventory":
        return <AddInventoryPage />;
      case "enquiries":
        return <Enquiries />;
      default:
        return <DashboardSummary />;
    }
  };

  const handleLinkClick = (page) => {
    setView(page);
    setSidebarOpen(false); // Close sidebar on link click (small screens)
  };

  return (
    <div className="admin-dashboard">
      <button
        className="hamburger-btn"
        onClick={() => setSidebarOpen((prev) => !prev)}
      >
        <i className="fas fa-bars"></i>
      </button>

      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        {sidebarOpen && (
          <button
            className="close-sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            &times;
          </button>
        )}

        <h2>Admin Panel</h2>
        <ul>
          <li onClick={() => handleLinkClick("dashboard")}>Dashboard</li>
          <li onClick={() => handleLinkClick("products")}>Products</li>
          <li onClick={() => handleLinkClick("add-product")}>Add Product</li>
          <li onClick={() => handleLinkClick("add-inventory")}>
            Add Inventory
          </li>
          <li onClick={() => handleLinkClick("categories")}>Categories</li>
          <li onClick={() => handleLinkClick("inventory")}>Inventory</li>
          <li onClick={() => handleLinkClick("enquiries")}>Enquiries</li>
          <li onClick={() => navigate("/dashboard")}>Logout</li>
        </ul>
      </aside>

      <main className="admin-content">{renderView()}</main>
    </div>
  );
}
