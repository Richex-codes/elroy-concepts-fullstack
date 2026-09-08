import { useState, useEffect, useRef, Fragment } from "react";
import api from "../api/axios.js";
import { getOwnBranchId } from "../utils/authUser.js";
import ConfirmModal from "./ConfirmModal.jsx";
import { useConfirm } from "../utils/useConfirm.js";
import ErrorBanner from "./ErrorBanner.jsx";
import { useApiError } from "../utils/useApiError.js";
import Pagination from "./Pagination.jsx";
import "../styles/Transfers.css";

const PAGE_SIZE = 40;

export default function TransfersPage() {
  const { confirm, modalProps } = useConfirm();
  const { error, showError, clearError } = useApiError();

  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);

  const [selectedProduct, setSelectedProduct] = useState("");
  // Branch admins land here already filtered to their own branch; they can
  // still switch to "All Branches" or another one from the dropdown. A
  // branch shows up here if it's on either side of the transfer.
  const [selectedBranch, setSelectedBranch] = useState(getOwnBranchId);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedTransferId, setExpandedTransferId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsRes, branchesRes] = await Promise.all([
          api.get("/products", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }),
          api.get("/admin/branches", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }),
        ]);
        setProducts(productsRes.data);
        setBranches(branchesRes.data);
        fetchTransfers();
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTransfers = async () => {
    setLoading(true);
    const requestId = ++latestRequestId.current;
    try {
      const res = await api.get("/admin/transfers", {
        params: {
          product: selectedProduct,
          branch: selectedBranch,
          fromDate,
          toDate,
        },
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (requestId !== latestRequestId.current) return;
      clearError();
      setTransfers(res.data);
      setPage(1);
    } catch (err) {
      console.error(err);
      if (requestId === latestRequestId.current) {
        showError(err, "Failed to load transfers.");
        setTransfers([]);
      }
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchTransfers();
  };

  const handleDelete = async (transfer) => {
    const itemCount = transfer.items?.length || 0;
    const confirmed = await confirm(
      `Delete this transfer from ${transfer.fromBranch} to ${transfer.toBranch}? This will restore ${itemCount} item${
        itemCount === 1 ? "" : "s"
      } back to ${transfer.fromBranch} and cannot be undone.`,
      { title: "Delete transfer", confirmLabel: "Delete", danger: true }
    );
    if (!confirmed) return;

    try {
      await api.delete(`/admin/transfers/${transfer._id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setTransfers((prev) => prev.filter((t) => t._id !== transfer._id));
      if (expandedTransferId === transfer._id) setExpandedTransferId(null);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to delete transfer.");
    }
  };

  return (
    <div className="transfers-page">
      <h1>Stock Transfers</h1>
      <ErrorBanner message={error} onDismiss={clearError} />
      <div className="transfers-filters">
        <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
          <option value="">All Products</option>
          {products.map((product) => (
            <option key={product._id} value={product._id}>
              {product.name}
            </option>
          ))}
        </select>

        <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
          <option value="">All Branches</option>
          {branches.map((branch) => (
            <option key={branch._id} value={branch._id}>
              {branch.name}
            </option>
          ))}
        </select>

        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />

        <button onClick={handleSearch}>Search</button>
      </div>

      <div className="transfers-table-container">
        <table className="transfers-inventory-table">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Items</th>
              <th>Date</th>
              <th>Details</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading && transfers.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty-state">
                  Loading transfers...
                </td>
              </tr>
            )}
            {!loading && transfers.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty-state">
                  No transfers found for this period.
                </td>
              </tr>
            )}
            {transfers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((transfer, idx) => (
              <Fragment key={transfer._id}>
                <tr className={idx % 2 === 1 ? "row-alt" : ""}>
                  <td data-label="From">{transfer.fromBranch}</td>
                  <td data-label="To">{transfer.toBranch}</td>
                  <td data-label="Items">
                    {transfer.items?.length || 0} item{(transfer.items?.length || 0) === 1 ? "" : "s"}
                  </td>
                  <td data-label="Date">{new Date(transfer.transferDate).toLocaleDateString()}</td>
                  <td data-label="Details">
                    <button
                      className="invoice-toggle-btn"
                      onClick={() =>
                        setExpandedTransferId(expandedTransferId === transfer._id ? null : transfer._id)
                      }
                    >
                      {expandedTransferId === transfer._id ? "Close" : "Details"}
                    </button>
                  </td>
                  <td data-label="Actions">
                    <button className="sale-delete-btn" onClick={() => handleDelete(transfer)}>
                      Delete
                    </button>
                  </td>
                </tr>
                {expandedTransferId === transfer._id && (
                  <tr key={`${transfer._id}-detail`} className="sale-detail-row">
                    <td colSpan={6} className="invoice-actions-cell">
                      <table className="transfer-items-detail-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Color</th>
                            <th className="col-right">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transfer.items?.map((item, i) => (
                            <tr key={i}>
                              <td>{item.productName}</td>
                              <td>{item.color}</td>
                              <td className="col-right">{item.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {transfer.notes && <p className="transfer-notes">Notes: {transfer.notes}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} setPage={setPage} totalItems={transfers.length} pageSize={PAGE_SIZE} />
      <ConfirmModal {...modalProps} />
    </div>
  );
}
