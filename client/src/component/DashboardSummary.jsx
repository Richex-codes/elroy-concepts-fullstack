import React, { useEffect, useState, useRef } from "react";
import api from "../api/axios.js";
import ReportActions from "./ReportActions.jsx";
import { getOwnBranchId } from "../utils/authUser.js";
import ErrorBanner from "./ErrorBanner.jsx";
import { useApiError } from "../utils/useApiError.js";
import "../styles/DashboardSummary.css";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

export default function DashboardSummary() {
  const { error, showError, clearError } = useApiError();
  const [branches, setBranches] = useState([]);
  // Branch admins land here already filtered to their own branch ("all" is
  // this component's sentinel for "no branch selected"); they can still
  // switch to "All Branches" or another one from the dropdown.
  const [selectedBranch, setSelectedBranch] = useState(() => getOwnBranchId() || "all");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [summary, setSummary] = useState({
  products: 0,
  categories: 0,
  enquiries: 0,
  inventoryEntries: 0,
  stockQuantity: 0,
  lowStockCount: 0,
  totalSales: 0,
  totalRevenue: 0,
  outstandingDebt: 0,
});
  const [recentProducts, setRecentProducts] = useState([]);
  const [recentInventory, setRecentInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [topDebtors, setTopDebtors] = useState([]);
  const [loading, setLoading] = useState(true);
  const latestRequestId = useRef(0);

  const formatNaira = (value) =>
    `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

  // Fetch branches
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await api.get(
          "/admin/branches",
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
    // Guards against rapidly switching branch/year: if a newer request
    // starts before this one resolves, this one's results are discarded
    // instead of briefly overwriting the dashboard with the wrong branch's
    // numbers.
    const requestId = ++latestRequestId.current;
    try {
      const summaryUrl =
        selectedBranch === "all"
          ? "/admin/summary"
          : `/admin/summary/${selectedBranch}`;

      const recentProductsUrl =
        selectedBranch === "all"
          ? "/products/recent-products"
          : `/products/recent-products/${selectedBranch}`;

      const recentInventoryUrl =
        selectedBranch === "all"
          ? "/products/recent-inventory"
          : `/products/recent-inventory/${selectedBranch}`;

      const lowStockUrl =
      selectedBranch === "all"
        ? "/products/low-stock"
        : `/products/low-stock/${selectedBranch}`;

      const authHeaders = {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      };
      const branchParams =
        selectedBranch === "all" ? {} : { branch: selectedBranch };

      const [
        summaryRes,
        recentProdRes,
        recentInvRes,
        lowStockRes,
        recentSalesRes,
        debtorsRes,
      ] = await Promise.all([
        api.get(summaryUrl, { ...authHeaders, params: { year: selectedYear } }),
        api.get(recentProductsUrl, authHeaders),
        api.get(recentInventoryUrl, authHeaders),
        api.get(lowStockUrl, authHeaders),
        api.get("/admin/sales", { ...authHeaders, params: branchParams }),
        api.get("/admin/debtors", { ...authHeaders, params: branchParams }),
      ]);

      if (requestId !== latestRequestId.current) return;

      clearError();
      setSummary(summaryRes.data);
      setRecentProducts(recentProdRes.data);
      setRecentInventory(recentInvRes.data);
      setLowStock(lowStockRes.data);
      setRecentSales(recentSalesRes.data.slice(0, 5));
      setTopDebtors(
        [...debtorsRes.data]
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 5)
      );
    } catch (err) {
      console.error("Failed to load dashboard data", err);
      if (requestId === latestRequestId.current) {
        showError(err, "Failed to load dashboard data.");
      }
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  };

  fetchDashboardData();
}, [selectedBranch, selectedYear]);



  return (
    <div className="dashboard-summary">
      <h2 className="dashboard-title">Welcome, Admin</h2>
      <ErrorBanner message={error} onDismiss={clearError} />

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

        <label htmlFor="year-select">Year:</label>
        <select
          id="year-select"
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
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
              <i className="fas fa-cash-register"></i>
              <div>
                <h3>Sales ({selectedYear})</h3>
                <p>{summary.totalSales}</p>
              </div>
            </div>

            <div className="summary-card">
              <i className="fas fa-sack-dollar"></i>
              <div>
                <h3>Revenue ({selectedYear})</h3>
                <p>{formatNaira(summary.totalRevenue)}</p>
              </div>
            </div>

            <div className="summary-card summary-card-danger">
              <i className="fas fa-file-invoice-dollar"></i>
              <div>
                <h3>Outstanding Debt</h3>
                <p>{formatNaira(summary.outstandingDebt)}</p>
                <small className="summary-card-note">All-time, every year</small>
              </div>
            </div>

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

            <div className="summary-card">
              <i className="fas fa-warehouse"></i>
              <div>
                <h3>Total Stock</h3>
                <p>{summary.stockQuantity}</p>
              </div>
            </div>

            <div className="summary-card">
              <i className="fas fa-triangle-exclamation"></i>
              <div>
                <h3>Low Stock Items</h3>
                <p>{summary.lowStockCount}</p>
              </div>
            </div>

            <div className="summary-card">
              <i className="fas fa-warehouse"></i>
              <div>
                <h3>Inventory Entries</h3>
                <p>{summary.inventoryEntries}</p>
              </div>
            </div>

          </div>

          {/* ✅ Recent Activity Section */}
          <div className="recent-activity">
            <h3>Recent Sales</h3>
            <ul>
              {recentSales.length === 0 ? (
                <li>No sales recorded yet.</li>
              ) : (
                recentSales.map((sale) => (
                  <li key={sale._id}>
                    <strong>{sale.customerName}</strong> –{" "}
                    {sale.items?.length || 0} item
                    {(sale.items?.length || 0) === 1 ? "" : "s"} <br />
                    <small>
                      {sale.items?.map((i) => i.productName).join(", ")}
                    </small>
                    <br />
                    <small>
                      {formatNaira(sale.amount)} •{" "}
                      {new Date(sale.saleDate).toLocaleDateString()}
                    </small>
                  </li>
                ))
              )}
            </ul>
          </div>
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
                    <strong>{entry.productName}</strong> – {entry.branch} <br />
                    <small>
                      Color: {entry.color} • Qty: {entry.quantity}
                    </small>
                    <br />
                    <small>
                      {entry.description || "No description"} •{" "}
                      {new Date(entry.addedAt).toLocaleDateString()}
                    </small>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="low-stock-alerts">
            <div className="low-stock-alerts-header">
              <h3>Low Stock Alerts</h3>
              <ReportActions
                pdfEndpoint="/admin/low-stock/pdf"
                emailEndpoint="/admin/low-stock/email"
                extraParams={
                  selectedBranch === "all" ? {} : { branch: selectedBranch }
                }
                fileName="Low-Stock-Alert"
              />
            </div>
            <ul>
              {lowStock.length === 0 ? (
                <li>No low stock issues found.</li>
              ) : (
                lowStock.map((item, index) => (
                  <li key={index}>
                    <strong>{item.name}</strong> – {item.branchName} <br />
                    <small>
                      Color: {item.color} • Qty: {item.quantity}
                    </small>
                    <br />
                    <small>
                      Category: {item.category}
                    </small>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="low-stock-alerts">
            <h3>Top Debtors</h3>
            <ul>
              {topDebtors.length === 0 ? (
                <li>No outstanding debts.</li>
              ) : (
                topDebtors.map((debtor) => (
                  <li key={debtor._id}>
                    <strong>{debtor.customerName}</strong> –{" "}
                    {debtor.items?.map((i) => i.product?.name).join(", ")} <br />
                    <small>
                      Owes <strong>{formatNaira(debtor.balance)}</strong> •{" "}
                      {new Date(debtor.saleDate).toLocaleDateString()}
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
