import React, { useEffect, useState, useRef } from "react";
import api from "../api/axios.js";
import ReportActions from "./ReportActions.jsx";
import SearchableSelect from "./SearchableSelect.jsx";
import { getOwnBranchId } from "../utils/authUser.js";
import ErrorBanner from "./ErrorBanner.jsx";
import { useApiError } from "../utils/useApiError.js";
import "../styles/Inventory.css";

const PAGE_SIZE = 40;

function Pagination({ page, setPage, totalItems, pageSize }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="pagination-controls">
      <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
        Previous
      </button>
      <span className="pagination-status">
        Page {page} of {totalPages}
      </span>
      <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
        Next
      </button>
    </div>
  );
}

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
  const [stockPage, setStockPage] = useState(1);
  const [summaryPage, setSummaryPage] = useState(1);

  // Cost-editing modal: costModalItem is the stock row (with its batches)
  // currently open for editing, or null when closed. batchDrafts holds the
  // in-progress input values per batch id, separate from the batch's actual
  // stored values, so typing doesn't mutate anything until Save is pressed.
  const [costModalItem, setCostModalItem] = useState(null);
  const [batchDrafts, setBatchDrafts] = useState({});
  const [savingBatchId, setSavingBatchId] = useState(null);
  const [costModalMessage, setCostModalMessage] = useState("");
  const [costModalError, setCostModalError] = useState(false);

  const formatNaira = (value) => `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

  const weightedAvgCost = (batches) => {
    const totalQty = (batches || []).reduce((sum, b) => sum + (b.quantityRemaining || 0), 0);
    if (totalQty === 0) return null;
    const totalCost = (batches || []).reduce(
      (sum, b) => sum + (b.quantityRemaining || 0) * (b.unitLandedCost || 0),
      0
    );
    return totalCost / totalQty;
  };




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
    setSummaryPage(1);
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
    setStockPage(1);
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

  const openCostModal = (item) => {
    setCostModalItem(item);
    const drafts = {};
    (item.batches || []).forEach((b) => {
      drafts[b._id] = { unitLandedCost: b.unitLandedCost ?? 0, supplierRef: b.supplierRef || "" };
    });
    setBatchDrafts(drafts);
    setCostModalMessage("");
    setCostModalError(false);
  };

  const closeCostModal = () => {
    setCostModalItem(null);
    setBatchDrafts({});
  };

  const handleSaveBatch = async (batchId) => {
    const draft = batchDrafts[batchId];
    if (!draft || draft.unitLandedCost === "" || Number(draft.unitLandedCost) < 0) {
      setCostModalError(true);
      setCostModalMessage("Enter a valid, non-negative cost.");
      return;
    }
    setSavingBatchId(batchId);
    setCostModalMessage("");
    setCostModalError(false);
    try {
      await api.patch(
        `/products/${costModalItem.productId}/inventory/${costModalItem.inventoryId}/batches/${batchId}`,
        { unitLandedCost: Number(draft.unitLandedCost), supplierRef: draft.supplierRef },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      setCostModalMessage("Cost updated.");
      setCostModalError(false);
      // Reflect the change immediately in the open modal (costEstimated is
      // always cleared server-side once a real cost is provided) without
      // waiting on a full refetch.
      setCostModalItem((prev) => ({
        ...prev,
        batches: prev.batches.map((b) =>
          b._id === batchId
            ? { ...b, unitLandedCost: Number(draft.unitLandedCost), supplierRef: draft.supplierRef, costEstimated: false }
            : b
        ),
      }));
      fetchStock(); // background refresh so the table's cost summary is current once the modal closes
    } catch (err) {
      setCostModalError(true);
      setCostModalMessage(err.response?.data?.message || "Failed to update cost.");
    } finally {
      setSavingBatchId(null);
    }
  };

  return (
    <div className="inventory-page">
      <h2>Inventory by Branch</h2>
      <ErrorBanner message={error} onDismiss={clearError} />

      <section className="inventory-section">
      {/* Filters */}
      <div className="inventory-filters">
        <SearchableSelect
          options={[
            { value: "", label: "All Products" },
            ...products.map((product) => ({ value: product._id, label: product.name })),
          ]}
          value={selectedProduct}
          onChange={setSelectedProduct}
          placeholder="All Products"
        />

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
          <option value="White">White</option>
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
              <th>Length</th>
              <th className="col-right">Quantity</th>
              <th className="col-right">Cost</th>
              <th>Description</th>
              <th>Added At</th>
            </tr>
          </thead>
          <tbody>
            {loading && stock.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty-state">
                  Loading inventory...
                </td>
              </tr>
            )}
            {!loading && stock.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty-state">
                  No inventory entries found for this period.
                </td>
              </tr>
            )}
            {stock.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE).map((item, idx) => {
              const avgCost = weightedAvgCost(item.batches);
              const anyEstimated = (item.batches || []).some((b) => b.costEstimated);
              return (
                <tr key={item.inventoryId || idx} className={idx % 2 === 1 ? "row-alt" : ""}>
                 <td data-label="Product">{item.product}</td>
                  <td data-label="Branch">{item.branch}</td>
                  <td data-label="Color">{item.color || "-"}</td>
                  <td data-label="Length">
                    {item.length != null ? `${item.length}m${item.isRemnant ? " (offcut)" : ""}` : "-"}
                  </td>
                  <td className="col-right" data-label="Quantity">{item.quantity}</td>
                  <td className="col-right" data-label="Cost">
                    {avgCost != null ? formatNaira(avgCost) : "-"}
                    {anyEstimated && <span className="cost-estimated-badge">Est.</span>}
                    {item.inventoryId && (
                      <button type="button" className="btn-edit-cost" onClick={() => openCostModal(item)}>
                        Edit
                      </button>
                    )}
                  </td>
                  <td data-label="Description">
                    {item.description || "-"}
                  </td>
                  <td data-label="Added At">
                    {new Date(item.addedAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      <Pagination page={stockPage} setPage={setStockPage} totalItems={stock.length} pageSize={PAGE_SIZE} />
      </section>

      <section className="inventory-section">
      <h3>Inventory Summary by Branch</h3>
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
                <th>Length</th>
                <th className="col-right">Total Qty</th>
              </tr>
            </thead>

            <tbody>
            {loading && summary.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty-state">
                  Loading summary...
                </td>
              </tr>
            )}
            {!loading && summary.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty-state">
                  No inventory summary data found.
                </td>
              </tr>
            )}
            {summary.slice((summaryPage - 1) * PAGE_SIZE, summaryPage * PAGE_SIZE).map((item, index) => (
              <tr key={index} className={index % 2 === 1 ? "row-alt" : ""}>
                <td data-label="Branch">{item.branch}</td>
                <td data-label="Product">{item.product}</td>
                <td data-label="Color">{item.color || "-"}</td>
                <td data-label="Length">
                  {item.length != null ? `${item.length}m${item.isRemnant ? " (offcut)" : ""}` : "-"}
                </td>
                <td className="col-right" data-label="Total Qty">{item.totalQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>
      </div>
      <Pagination page={summaryPage} setPage={setSummaryPage} totalItems={summary.length} pageSize={PAGE_SIZE} />
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

      {costModalItem && (
        <div className="cost-modal-backdrop" onClick={closeCostModal}>
          <div className="cost-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Edit Cost — {costModalItem.product} ({costModalItem.color || "-"}
              {costModalItem.length != null ? ` · ${costModalItem.length}m` : ""})
            </h3>
            <p className="cost-modal-subtitle">
              {costModalItem.branch}. Correcting a cost here only affects future sales that draw
              from this batch -- sales already recorded keep their original cost.
            </p>

            {costModalMessage && (
              <div className={`alert ${costModalError ? "alert-error" : "alert-success"}`}>
                {costModalMessage}
              </div>
            )}

            <div className="cost-modal-table-wrapper">
              <table className="cost-modal-table">
                <thead>
                  <tr>
                    <th>Arrived</th>
                    <th className="col-right">Qty Remaining</th>
                    <th>Unit Cost (₦)</th>
                    <th>Supplier Ref</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(costModalItem.batches || []).map((batch) => (
                    <tr key={batch._id}>
                      <td data-label="Arrived">{new Date(batch.arrivalDate).toLocaleDateString()}</td>
                      <td className="col-right" data-label="Qty Remaining">{batch.quantityRemaining}</td>
                      <td data-label="Unit Cost (₦)">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={batchDrafts[batch._id]?.unitLandedCost ?? ""}
                          onChange={(e) =>
                            setBatchDrafts((prev) => ({
                              ...prev,
                              [batch._id]: { ...prev[batch._id], unitLandedCost: e.target.value },
                            }))
                          }
                        />
                        {batch.costEstimated && <span className="cost-estimated-badge">Estimated</span>}
                      </td>
                      <td data-label="Supplier Ref">
                        <input
                          type="text"
                          value={batchDrafts[batch._id]?.supplierRef ?? ""}
                          onChange={(e) =>
                            setBatchDrafts((prev) => ({
                              ...prev,
                              [batch._id]: { ...prev[batch._id], supplierRef: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={savingBatchId === batch._id}
                          onClick={() => handleSaveBatch(batch._id)}
                        >
                          {savingBatchId === batch._id ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className="cost-modal-close" onClick={closeCostModal}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
