import React, { useEffect, useState } from "react";
import axios from "axios";
import "../styles/DashboardSummary.css";

export default function DashboardSummary() {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [summary, setSummary] = useState({
    products: 0,
    categories: 0,
    enquiries: 0,
  });
  const [recentProducts, setRecentProducts] = useState([]);
  const [recentInventory, setRecentInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch branches
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await axios.get(
          "https://elroy-concepts.onrender.com/admin/branches",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setBranches(res.data);
      } catch (err) {
        console.error("Failed to load branches", err);
      }
    };
    fetchBranches();
  }, []);

  // Fetch summary + recent products
  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const summaryUrl =
          selectedBranch === "all"
            ? "https://elroy-concepts.onrender.com/admin/summary"
            : `https://elroy-concepts.onrender.com/admin/summary/${selectedBranch}`;
        const recentProductsUrl =
          selectedBranch === "all"
            ? "https://elroy-concepts.onrender.com/products/recent"
            : `https://elroy-concepts.onrender.com/products/recent/${selectedBranch}`;
        const recentInventoryUrl =
          selectedBranch === "all"
            ? "https://elroy-concepts.onrender.com/products/recent-inventory"
            : `https://elroy-concepts.onrender.com/products/recent-inventory/${selectedBranch}`;
        const lowStockUrl =
          "https://elroy-concepts.onrender.com/products/low-stock";

        const [summaryRes, recentProdRes, recentInvRes, lowStockRes] =
          await Promise.all([
            axios.get(summaryUrl, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }),
            axios.get(recentProductsUrl, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }),
            axios.get(recentInventoryUrl, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }),
            axios.get(lowStockUrl, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }),
          ]);

        setSummary(summaryRes.data);
        setRecentProducts(recentProdRes.data);
        setRecentInventory(recentInvRes.data);
        setLowStock(lowStockRes.data);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, [selectedBranch]);

  return (
    <div className="dashboard-summary">
      <h2 className="dashboard-title">Welcome, Admin</h2>

      <div className="branch-selector">
        <label htmlFor="branch-select">Filter by Branch:</label>
        <select
          id="branch-select"
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
        >
          <option value="all">All Branches</option>
          {branches.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="loading-message">Loading summary...</p>
      ) : (
        <>
          <div className="summary-cards">
            <div className="summary-card">
              <i className="fas fa-box"></i>
              <div>
                <h3>Total Products</h3>
                <p>{summary.products}</p>
              </div>
            </div>
            <div className="summary-card">
              <i className="fas fa-layer-group"></i>
              <div>
                <h3>Total Categories</h3>
                <p>{summary.categories}</p>
              </div>
            </div>
            <div className="summary-card">
              <i className="fas fa-envelope-open-text"></i>
              <div>
                <h3>Total Enquiries</h3>
                <p>{summary.enquiries}</p>
              </div>
            </div>
          </div>

          {/* ✅ Recent Activity Section */}
          <div className="recent-activity">
            <h3>Recent Product Activity</h3>
            <ul>
              {recentProducts.length === 0 ? (
                <li>No recent activity found.</li>
              ) : (
                recentProducts.map((item) => (
                  <li key={item._id}>
                    <strong>{item.name}</strong> – {item.category?.name} <br />
                    <small>
                      Added on {new Date(item.createdAt).toLocaleDateString()}
                    </small>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="recent-activity">
            <h3>Recent Inventory Updates</h3>
            <ul>
              {recentInventory.length === 0 ? (
                <li>No recent inventory updates.</li>
              ) : (
                recentInventory.map((entry, index) => (
                  <li key={index}>
                    <strong>{entry.name}</strong> – {entry.branch} <br />
                    <small>
                      Quantity: {entry.quantity} •{" "}
                      {new Date(entry.addedAt).toLocaleDateString()}
                    </small>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="low-stock-alerts">
            <h3>Low Stock Alerts</h3>
            <ul>
              {lowStock.length === 0 ? (
                <li>No low stock issues found.</li>
              ) : (
                lowStock.map((item, index) => (
                  <li key={index}>
                    <strong>{item.name}</strong> – {item.branchName} <br />
                    <small>
                      Quantity: {item.quantity} • Category: {item.category}
                    </small>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
