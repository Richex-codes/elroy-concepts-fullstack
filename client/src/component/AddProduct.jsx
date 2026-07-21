import React, { useState, useEffect } from "react";
import api from "../api/axios.js";
import { isOwnBranch } from "../utils/authUser.js";
import { newIdempotencyKey } from "../utils/idempotencyKey.js";
import "../styles/AddProduct.css";

export default function AddProductPage() {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    image: null,
    dateAdded: ""
  });
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]); // 🟡 Store branch list
  const [inventory, setInventory] = useState([]); // 🟡 Store quantity per branch
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const COLORS = [
  "Gold",
  "Silver",
  "Bronze",
  "Black",
  "Dark Bronze",
  "Wood",
  "No Color",
  ];

  // Explicit pixel width so the grid's own box (and therefore its
  // background) always matches its content exactly, regardless of how
  // any given browser resolves `fit-content`/`max-content` on a grid
  // nested inside an overflow-x:auto ancestor (some clamp it to the
  // ancestor's visible width instead of the true intrinsic content size).
  const BRANCH_COL_WIDTH = 140;
  const COLOR_COL_WIDTH = 90;
  const GRID_GAP = 10;
  const GRID_PADDING = 10;
  const gridBoxWidth =
    BRANCH_COL_WIDTH +
    COLORS.length * COLOR_COL_WIDTH +
    COLORS.length * GRID_GAP +
    GRID_PADDING * 2;
  const gridStyle = {
    gridTemplateColumns: `${BRANCH_COL_WIDTH}px repeat(${COLORS.length}, ${COLOR_COL_WIDTH}px)`,
    width: `${gridBoxWidth}px`,
  };

  useEffect(() => {
    // 🔵 Load categories
    const fetchCategories = async () => {
      try {
        const res = await api.get(
          "/admin/categories",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setCategories(res.data);
      } catch (err) {
        console.error("Error fetching categories:", err);
      }
    };

    // 🔵 Load branches
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
        // Branch admins can only ever set opening stock for their own
        // branch(es) (the server rejects anything else), so they only see
        // those rows in the grid below instead of every branch.
        const visibleBranches = res.data.filter((b) => isOwnBranch(b._id));

        setBranches(visibleBranches);
        // ⚠️ Initialize inventory with all visible branches and quantity 0
        const initialInventory = [];

        visibleBranches.forEach((branch) => {
          COLORS.forEach((color) => {
            initialInventory.push({
              branch: branch._id,
              color,
              quantity: 0,
              description: "", // ✅ ADDED
            });
          });
        });

      setInventory(initialInventory);
      } catch (err) {
        console.error("Error fetching branches:", err);
      }
    };

    fetchCategories();
    fetchBranches();
  }, []);

  // 🔵 Handle form and image input
  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "image") {
      setFormData({ ...formData, image: files[0] });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  // 🔵 Handle branch quantity input
  const handleInventoryChange = (branchId, color, field, value) => {
  const updated = inventory.map((item) =>
    item.branch === branchId && item.color === color
      ? {
          ...item,
          [field]: field === "quantity" ? parseInt(value) || 0 : value,
        }
      : item
  );

  setInventory(updated);
};

  // 🔵 Submit everything including inventory
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

   const filteredInventory = inventory
  .filter((item) => item.quantity > 0)
  .map((item) => ({
    ...item,
    description: formData.description, // ✅ SAME DESC FOR ALL
  }));

    if (filteredInventory.length === 0) {
      setIsError(true);
      setMessage("Please set quantity for at least one branch.");
      setLoading(false);
      return;
    }
    // 🟡 Prepare form data with inventory
    const payload = new FormData();
    payload.append("name", formData.name);
    payload.append("category", formData.category);
    if (formData.image) {
    payload.append("image", formData.image);
    }
    payload.append("dateAdded", formData.dateAdded);  
    payload.append("inventory", JSON.stringify(filteredInventory)); // send inventory

    try {
      await api.post("/products", payload, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Idempotency-Key": idempotencyKey,
        },
      });
      setIsError(false);
      setMessage("Product added successfully!");
      setIdempotencyKey(newIdempotencyKey()); // this product is done; the next submit is a new one
      setFormData({ name: "", description: "", category: "", image: null, dateAdded: "" });
      const resetInventory = [];
      branches.forEach((branch) => {
        COLORS.forEach((color) => {
          resetInventory.push({
            branch: branch._id,
            color,
            quantity: 0,
            description: "",
          });
        });
      });
      setInventory(resetInventory);
    } catch (err) {
      console.error("Error adding product:", err);
      setIsError(true);
      setMessage("Failed to add product.");
    } finally{
      setLoading(false);
    }
  };

  return (
    <div className="add-product-page">
      <div className="add-product-icon">
        <i className="fas fa-box-open"></i>
      </div>
      <h2>Add New Product</h2>
      <p className="add-product-subtitle">
        Create a new catalog item, then set its opening stock per branch.
      </p>

      {message && (
        <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="product-form">
        <p className="product-form-section-label">Product Details</p>

        <div className="product-form-row">
          <div className="product-form-field">
            <label>Product Name</label>
            <input
              type="text"
              name="name"
              placeholder="e.g. 50mm Sliding Window"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="product-form-field">
            <label>Category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="product-form-field">
          <label>Description</label>
          <textarea
            name="description"
            placeholder="Short description shown alongside the product..."
            value={formData.description}
            onChange={handleChange}
            required
          />
        </div>

        <div className="product-form-row">
          <div className="product-form-field">
            <label>Product Date</label>
            <input
              type="date"
              name="dateAdded"
              value={formData.dateAdded}
              onChange={handleChange}
              required
            />
          </div>

          <div className="product-form-field">
            <label>Product Image</label>
            <input
              type="file"
              name="image"
              accept="image/*"
              onChange={handleChange}
            />
          </div>
        </div>

        <h4>Set Quantity Per Branch</h4>
        <p className="product-form-section-hint">
          Only branches with a quantity above zero are saved as opening stock.
        </p>
       {/* DESKTOP GRID */}
<div className="inventory-grid">
  <div className="grid-header" style={gridStyle}>
    <div className="grid-header-cell">Branch</div>
    {COLORS.map((color) => (
      <div key={color} className="grid-header-cell">{color}</div>
    ))}
  </div>

  {branches.map((branch) => (
    <div
      className="grid-row"
      key={branch._id}
      style={gridStyle}
    >
      <div className="branch-name">{branch.name}</div>

      {COLORS.map((color) => {
  const item = inventory.find(
    (i) => i.branch === branch._id && i.color === color
  );

  return (
    <div key={color} className="grid-cell">
      {/* Quantity */}
      <input
        type="number"
        min="0"
        value={item?.quantity || 0}
        onChange={(e) =>
          handleInventoryChange(
            branch._id,
            color,
            "quantity",
            e.target.value
          )
        }
      />
          </div>
        );
      })}
    </div>
  ))}
</div>

{/* MOBILE LAYOUT */}
<div className="mobile-inventory">
  {branches.map((branch) => (
    <div key={branch._id} className="branch-card">
      <h4>{branch.name}</h4>

      {COLORS.map((color) => {
        const item = inventory.find(
          (i) =>
            i.branch === branch._id && i.color === color
        );

        return (
          <div key={color} className="mobile-row">
            <span>{color}</span>

            <input
              type="number"
              min="0"
              value={item?.quantity || 0}
              onChange={(e) =>
                handleInventoryChange(
                  branch._id,
                  color,
                  "quantity",
                  e.target.value
                )
              }
            />
          </div>
        );
      })}
    </div>
  ))}
</div>

        <button type="submit" className="btn-primary" disabled={loading}>
          <i className="fas fa-box-open"></i> {loading ? "Adding Product..." : "Add Product"}
        </button>
      </form>
    </div>
  );
}
