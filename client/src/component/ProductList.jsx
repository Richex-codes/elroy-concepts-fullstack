import React, { useEffect, useState } from "react";
import api from "../api/axios.js";
import { getOwnBranchId } from "../utils/authUser.js";
import ConfirmModal from "./ConfirmModal.jsx";
import { useConfirm } from "../utils/useConfirm.js";
import ErrorBanner from "./ErrorBanner.jsx";
import { useApiError } from "../utils/useApiError.js";
import "../styles/ProductList.css";

export default function ProductListPage() {
  const { confirm, modalProps } = useConfirm();
  const { error, showError, clearError } = useApiError();
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);

  const [viewMode, setViewMode] = useState("card");

  // Branch admins land here already filtered to their own branch; they can
  // still switch to "All Branches" or another one from the dropdown.
  const [filters, setFilters] = useState(() => ({
    product: "",
    category: "",
    branch: getOwnBranchId(),
    color: "",
  }));

  // ========================
  // FETCH DATA
  // ========================
  const fetchData = async () => {
  try {
    const params = {};

    if (filters.product) params.name = filters.product;
    if (filters.category) params.category = filters.category;
    if (filters.branch) params.branch = filters.branch;
    if (filters.color) params.color = filters.color;

    const [productRes, branchRes] = await Promise.all([
      api.get("/products/product-inventory", {
        params,
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

    console.log("PRODUCTS:", productRes.data);

    clearError();
    setProducts(productRes.data || []);
    setBranches(branchRes.data || []);
  } catch (err) {
    console.error(err);
    showError(err, "Failed to load products.");
    setProducts([]);
  }
};

  useEffect(() => {
    fetchData();
  }, []);

  // ========================
  // FLATTEN INVENTORY
  // ========================
  const flattened = products.map((item) => ({
  id: item.inventoryId,
  productId: item.productId,
  productName: item.productName,
  category: item.category,
  branch: item.branch,
  branchId: item.branchId,
  color: item.color,
  image: item.image,
}));

  // ========================
  // FILTER CLIENT SIDE
  // ========================
  const filtered = flattened.filter((item) => {
  const productMatch = item.productName
    .toLowerCase()
    .includes(filters.product.toLowerCase());

  const categoryMatch =
    !filters.category ||
    (item.category?.toLowerCase().includes(filters.category.toLowerCase()) ?? false);

  const branchMatch =
    !filters.branch || item.branchId === filters.branch;

  const colorMatch =
    !filters.color || item.color === filters.color;

  return productMatch && categoryMatch && branchMatch && colorMatch;
});

  // ========================
  // DELETE INVENTORY LINE
  // ========================
  // Deletes just this branch+color line, not the whole product -- a row
  // here only ever represents one branch's stock, and a branch admin is
  // only allowed to remove their own branch's line anyway.
  const handleDelete = async (productId, inventoryId) => {
  const ok = await confirm("Delete this inventory item permanently?", {
    title: "Delete inventory item",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;

  try {
    await api.delete(`/products/${productId}/inventory/${inventoryId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    fetchData(); // refresh list
  } catch (err) {
    console.error(err);
    showError(err, "Failed to delete this inventory item.");
  }
};

  return (
    <div className="product-list-page">
      <ErrorBanner message={error} onDismiss={clearError} />

      {/* VIEW TOGGLE */}
      <div className="view-toggle">
        <button
          className={viewMode === "card" ? "active" : ""}
          onClick={() => setViewMode("card")}
        >
          Card View
        </button>
        <button
          className={viewMode === "table" ? "active" : ""}
          onClick={() => setViewMode("table")}
        >
          Table View
        </button>
      </div>

      {/* FILTERS */}
      <div className="inventory-filters">

      <input
        placeholder="Product"
        value={filters.product}
        onChange={(e) =>
          setFilters({ ...filters, product: e.target.value })
        }
      />

      <input
        placeholder="Category"
        value={filters.category}
        onChange={(e) =>
          setFilters({ ...filters, category: e.target.value })
        }
      />

      <select
        value={filters.branch}
        onChange={(e) =>
          setFilters({ ...filters, branch: e.target.value })
        }
      >
        <option value="">All Branches</option>
        {branches.map((b) => (
          <option key={b._id} value={b._id}>
            {b.name}
          </option>
        ))}
      </select>

      <select
        value={filters.color}
        onChange={(e) =>
          setFilters({ ...filters, color: e.target.value })
        }
      >
        <option value="">All Colors</option>
        <option>Gold</option>
        <option>Silver</option>
        <option>Bronze</option>
        <option>Black</option>
        <option>Dark Bronze</option>
        <option>Wood</option>
        <option>No Color</option>
      </select>

      {/* ✅ SEARCH BUTTON */}
      <button onClick={fetchData} className="search-btn">
        Search
      </button>

    </div>
      {/* CARD VIEW */}
      {viewMode === "card" ? (
        <div className="card-grid">
          {filtered.map((item) => (
          <div className="product-card" key={item.id}>
            {item.image && <img src={item.image} alt="" />}

            <h3>{item.productName}</h3>

            <p>
              <strong>Category:</strong> {item.category}
            </p>

            <p>
              <strong>Branch:</strong> {item.branch}
            </p>

            <p>
              <strong>Color:</strong> {item.color}
            </p>
            <button
            className="delete-btn"
            onClick={() => handleDelete(item.productId, item.id)}
          >
            Delete
          </button>

          </div>
        ))}
        </div>
      ) : (
        // TABLE VIEW
        <div className="table-container">
          <table className="product-table">
            <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Branch</th>
              <th>Color</th>
              <th>Action</th>
            </tr>
          </thead>

            <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td>{item.category}</td>
                <td>{item.branch}</td>
                <td>{item.color}</td>

                <td>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(item.productId, item.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
      <ConfirmModal {...modalProps} />
    </div>
  );
}