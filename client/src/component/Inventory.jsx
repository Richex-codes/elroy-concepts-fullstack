import React, { useEffect, useState, useRef } from "react";
import api from "../api/axios.js";
import ReportActions from "./ReportActions.jsx";
import { getOwnBranchId } from "../utils/authUser.js";
import ErrorBanner from "./ErrorBanner.jsx";
import { useApiError } from "../utils/useApiError.js";
import "../styles/Inventory.css";

export default function InventoryPage() {
  const { error, showError, clearError } = useApiError();
  const [summary, setSummary] = useState([]);
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  // Branch admins land here already filtered to their own branch; they can
  // still switch to "All Branches" or another one from the dropdown.
  const [selectedBranch, setSelectedBranch] = useState(getOwnBranchId);
  const [selectedColor, setSelectedColor] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const latestRequestId = useRef(0);




  const fetchProducts = async () => {
    try {
      const res =  await api.get("/products", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setProducts(res.data);
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  }

  const fetchBranches = async () => {
    try{
      const res = await api.get("/admin/branches", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        }
      });
      setBranches(res.data);
    } catch (err) {
      console.error("Error fetching branches:", err);
    }
  }
  

  const fetchSummary = async () => {
  // Shared across a search "operation" (set by the caller just before this
  // runs) so a slower, now-outdated request can't overwrite a newer one.
  const requestId = latestRequestId.current;
  try {
    const res = await api.get(
      "/admin/inventory-summary",
      {
        params: {
          product: selectedProduct,
          branch: selectedBranch,
          color: selectedColor,
        },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (requestId !== latestRequestId.current) return;
    clearError();
    setSummary(res.data);
  } catch (err) {
    console.error(
      "Error fetching inventory summary:",
      err
    );
    if (requestId === latestRequestId.current) {
      showError(err, "Failed to load inventory summary.");
      setSummary([]);
    }
  }
};

const fetchStock = async () => {
  const requestId = latestRequestId.current;
  try {
    const res = await api.get("/admin/inventory-stock", {
      params: {
        product: selectedProduct,
        branch: selectedBranch,
        color: selectedColor,
        fromDate,
        toDate,
      },
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (requestId !== latestRequestId.current) return;
    clearError();
    setStock(res.data);
  } catch (err) {
    console.error("Error fetching stock:", err);
    if (requestId === latestRequestId.current) {
      showError(err, "Failed to load inventory stock history.");
      setStock([]);
    }
  }
};

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      latestRequestId.current += 1;
      try {
        await Promise.all([fetchStock(), fetchSummary(), fetchProducts(), fetchBranches()]);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    latestRequestId.current += 1;
    try {
      await Promise.all([fetchStock(), fetchSummary()]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inventory-page">
      <h2>Inventory by Branch</h2>
      <p className="inventory-page-subtitle">
        Inventory log below shows this year by default — pick a date range to look further back.
      </p>
      <ErrorBanner message={error} onDismiss={clearError} />

      <section className="inventory-section">
      {/* Filters */}
      <div className="inventory-filters">
        <select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
        >
          <option value="">All Products</option>

          {products.map((product) => (
            <option key={product._id} value={product._id}>
              {product.name}
            </option>
          ))}
        </select>

         <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="">All Branches</option>

            {branches.map((branch) => ( 
              <option key={branch._id} value={branch._id}>
                {branch.name}
              </option>
            ))}
          </select>

        <select
          value={selectedColor}
          onChange={(e) =>
            setSelectedColor(e.target.value)
          }
        >
          <option value="">All Colors</option>

          <option value="Gold">Gold</option>
          <option value="Silver">Silver</option>
          <option value="Bronze">Bronze</option>
          <option value="Black">Black</option>
          <option value="Dark Bronze">
            Dark Bronze
          </option>
          <option value="Wood">Wood</option>
          <option value="No Color">No Color</option>
        </select>

        <button
          className="btn-primary"
          onClick={handleSearch}
        >
          Search
        </button>
        <div className="date-filters">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container">
        <div className="inventory-table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Branch</th>
              <th>Color</th>
              <th className="col-right">Quantity</th>
              <th>Description</th>
              <th>Added At</th>
            </tr>
          </thead>
          <tbody>
            {loading && stock.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty-state">
                  Loading inventory...
                </td>
              </tr>
            )}
            {!loading && stock.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty-state">
                  No inventory entries found for this period.
                </td>
              </tr>
            )}
            {stock.map((item, idx) => (
              <tr key={item._id} className={idx % 2 === 1 ? "row-alt" : ""}>
               <td data-label="Product">{item.product}</td>
                <td data-label="Branch">{item.branch}</td>
                <td data-label="Color">{item.color}</td>
                <td className="col-right" data-label="Quantity">{item.quantity}</td>
                <td data-label="Description">
                  {item.description || "-"}
                </td>
                <td data-label="Added At">
                  {new Date(item.addedAt).toLocaleDateString()}
                </td>
              </tr>
              ))}
          </tbody>
        </table>
        </div>
      </div>
      </section>

      <section className="inventory-section">
      <h3>Inventory Summary by Branch</h3>
      <p className="inventory-page-subtitle">
        Always the current running total — never limited by year or date.
      </p>
      <div className="inventory-actions">
        <ReportActions
          pdfEndpoint="/admin/inventory-summary/pdf"
          emailEndpoint="/admin/inventory-summary/email"
          extraParams={{
            product: selectedProduct,
            branch: selectedBranch,
            color: selectedColor,
          }}
          fileName="Inventory-Summary"
        />
      </div>

      <div className="table-container">
        {/* Total Summary Section */}

          <div className="inventory-summary">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Product</th>
                <th>Color</th>
                <th className="col-right">Total Qty</th>
              </tr>
            </thead>

            <tbody>
            {loading && summary.length === 0 && (
              <tr>
                <td colSpan={4} className="table-empty-state">
                  Loading summary...
                </td>
              </tr>
            )}
            {!loading && summary.length === 0 && (
              <tr>
                <td colSpan={4} className="table-empty-state">
                  No inventory summary data found.
                </td>
              </tr>
            )}
            {summary.map((item, index) => (
              <tr key={index} className={index % 2 === 1 ? "row-alt" : ""}>
                <td data-label="Branch">{item.branch}</td>
                <td data-label="Product">{item.product}</td>
                <td data-label="Color">{item.color}</td>
                <td className="col-right" data-label="Total Qty">{item.totalQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>
      </div>
      </section>

      <section className="inventory-section">
      <div className="inventory-summary">
        <h3>Total Quantity per Product</h3>

        <ul>
          {[
            ...summary
              .reduce((acc, item) => {
                // Group by productId, not name -- two different products
                // can share a display name, and grouping by name would
                // silently merge their totals together.
                const key = item.productId || item.product;
                const existing = acc.get(key);
                if (existing) {
                  existing.total += item.totalQuantity;
                } else {
                  acc.set(key, { product: item.product, total: item.totalQuantity });
                }
                return acc;
              }, new Map())
              .entries(),
          ].map(([key, { product, total }]) => (
            <li key={key}>
              <strong>{product}</strong>: {total}
            </li>
          ))}
        </ul>
      </div>
      </section>
    </div>
  );
}
