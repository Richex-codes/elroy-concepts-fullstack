import { useState, useEffect, useRef, Fragment } from "react";
import api from "../api/axios.js";
import ReportActions from "./ReportActions.jsx";
import { getOwnBranchId } from "../utils/authUser.js";
import ConfirmModal from "./ConfirmModal.jsx";
import { useConfirm } from "../utils/useConfirm.js";
import ErrorBanner from "./ErrorBanner.jsx";
import { useApiError } from "../utils/useApiError.js";
import "../styles/Sales.css";

const formatNaira = (value) =>
  `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

export default function SalesPage() {
    const { confirm, modalProps } = useConfirm();
    const { error, showError, clearError } = useApiError();


    const [sales, setSales] = useState([]);
    const [products, setProducts] = useState([]);
    const [branches, setBranches] = useState([]);

    const [selectedProduct, setSelectedProduct] = useState("");
    // Branch admins land here already filtered to their own branch; they can
    // still switch to "All Branches" or another one from the dropdown.
    const [selectedBranch, setSelectedBranch] = useState(getOwnBranchId);
    const [selectedColor, setSelectedColor] = useState("");
    const [customerSearch, setCustomerSearch] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [expandedSaleId, setExpandedSaleId] = useState(null);
    const [loading, setLoading] = useState(true);
    const latestRequestId = useRef(0);

    useEffect(() => {
  const fetchData = async () => {
    try {
      const [productsRes, branchesRes] = await Promise.all([
        api.get("/products", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }),
        api.get("/admin/branches", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }),
      ]);

      setProducts(productsRes.data);
      setBranches(branchesRes.data);

      // load initial sales
      fetchSales();
    } catch (err) {
      console.error(err);
    }
  };

  fetchData();
}, []);

const fetchSales = async () => {
  setLoading(true);
  // If a newer search fires before this one resolves, drop this response
  // instead of letting it overwrite the table with stale results.
  const requestId = ++latestRequestId.current;
  try {
    const res = await api.get("/admin/sales", {
      params: {
        product: selectedProduct,
        branch: selectedBranch,
        color: selectedColor,
        customerName: customerSearch,
        fromDate,
        toDate,
      },
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (requestId !== latestRequestId.current) return;
    clearError();
    setSales(res.data);
  } catch (err) {
    console.error(err);
    if (requestId === latestRequestId.current) {
      showError(err, "Failed to load sales.");
      setSales([]);
    }
  } finally {
    if (requestId === latestRequestId.current) setLoading(false);
  }
};

 

const handleSearch = () => {
    fetchSales();
}

const handleDelete = async (sale) => {
    const itemCount = sale.items?.length || 0;
    const confirmed = await confirm(
        `Delete this sale for ${sale.customerName || "this customer"}? This will restore ${itemCount} item${itemCount === 1 ? "" : "s"} back to inventory and cannot be undone.`,
        { title: "Delete sale", confirmLabel: "Delete", danger: true }
    );
    if (!confirmed) return;

    try {
        await api.delete(`/admin/sales/${sale._id}`, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
        });
        setSales((prev) => prev.filter((s) => s._id !== sale._id));
        if (expandedSaleId === sale._id) setExpandedSaleId(null);
    } catch (err) {
        console.error(err);
        alert(err.response?.data?.message || "Failed to delete sale.");
    }
}


    return (
        <div className="sales-page">
            <h1>Sales Summary</h1>
            <p className="sales-page-subtitle">
              Showing this year by default — pick a date range to look further back.
            </p>
            <ErrorBanner message={error} onDismiss={clearError} />
            <div className="sales-filters">
                {/* Customer */}    
                <input
                    type="text"
                    placeholder="Customer Name"
                    value={customerSearch}
                    onChange={(e) =>
                    setCustomerSearch(e.target.value)
                    }
                />

                {/* Product */}
                <select
                    value={selectedProduct}
                    onChange={(e) =>
                    setSelectedProduct(e.target.value)
                    }
                >
                    <option value="">All Products</option>

                    {products.map((product) => (
                    <option
                        key={product._id}
                        value={product._id}
                    >
                        {product.name}
                    </option>
                    ))}
                </select>

                {/* Branch */}
                <select
                    value={selectedBranch}
                    onChange={(e) =>
                    setSelectedBranch(e.target.value)
                    }
                >
                    <option value="">All Branches</option>

                    {branches.map((branch) => (
                    <option
                        key={branch._id}
                        value={branch._id}
                    >
                        {branch.name}
                    </option>
                    ))}
                </select>

                {/* Color */}
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

                <button onClick={handleSearch}>
                    Search
                </button>
                </div>

                <div className="sales-table-container">
                <table className="sales-inventory-table">
                    <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Branch</th>
                        <th>Items</th>
                        <th className="col-right">Amount</th>
                        <th className="col-right">Amount Paid</th>
                        <th className="col-right">Balance</th>
                        <th>Date</th>
                        <th>Details</th>
                        <th>Actions</th>
                    </tr>
                    </thead>

                    <tbody>
                    {loading && sales.length === 0 && (
                      <tr>
                        <td colSpan={9} className="table-empty-state">
                          Loading sales...
                        </td>
                      </tr>
                    )}
                    {!loading && sales.length === 0 && (
                      <tr>
                        <td colSpan={9} className="table-empty-state">
                          No sales found for this period.
                        </td>
                      </tr>
                    )}
                    {sales.map((sale, idx) => (
                        <Fragment key={sale._id}>
                        <tr className={idx % 2 === 1 ? "row-alt" : ""}>
                        <td data-label="Customer">{sale.customerName}</td>
                        <td data-label="Branch">{sale.branch}</td>
                        <td data-label="Items">{sale.items?.length || 0} item{(sale.items?.length || 0) === 1 ? "" : "s"}</td>
                        <td className="amount-cell" data-label="Amount">{formatNaira(sale.amount)}</td>
                        <td className="amount-cell" data-label="Amount Paid">{formatNaira(sale.amountPaid)}</td>
                        <td className={`amount-cell ${sale.balance > 0 ? "balance-cell" : ""}`} data-label="Balance">{formatNaira(sale.balance)}</td>
                        <td data-label="Date">
                            {new Date(
                            sale.saleDate
                            ).toLocaleDateString()}
                        </td>
                        <td data-label="Details">
                          <button
                            className="invoice-toggle-btn"
                            onClick={() =>
                              setExpandedSaleId(
                                expandedSaleId === sale._id ? null : sale._id
                              )
                            }
                          >
                            {expandedSaleId === sale._id ? "Close" : "Details"}
                          </button>
                        </td>
                        <td data-label="Actions">
                          <button
                            className="sale-delete-btn"
                            onClick={() => handleDelete(sale)}
                          >
                            Delete
                          </button>
                        </td>
                        </tr>
                        {expandedSaleId === sale._id && (
                          <tr key={`${sale._id}-actions`} className="sale-detail-row">
                            <td colSpan={9} className="invoice-actions-cell">
                              <table className="sale-items-detail-table">
                                <thead>
                                  <tr>
                                    <th>Product</th>
                                    <th>Color</th>
                                    <th>Qty</th>
                                    <th className="col-right">Rate</th>
                                    <th className="col-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sale.items?.map((item, i) => (
                                    <tr key={i}>
                                      <td>{item.productName}</td>
                                      <td>{item.color}</td>
                                      <td>{item.quantitySold}</td>
                                      <td className="amount-cell">
                                        {item.rate != null ? formatNaira(item.rate) : "-"}
                                      </td>
                                      <td className="amount-cell">{formatNaira(item.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <ReportActions
                                pdfEndpoint={`/admin/sales/${sale._id}/invoice`}
                                emailEndpoint={`/admin/sales/${sale._id}/invoice/email`}
                                fileName={`Invoice-${sale._id}`}
                              />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                    ))}
                    </tbody>
                </table>
                </div>
        <ConfirmModal {...modalProps} />
        </div>

    )

}