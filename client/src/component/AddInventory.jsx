import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios.js";
import SearchableSelect from "./SearchableSelect.jsx";
import { getOwnBranchId, isOwnBranch } from "../utils/authUser.js";
import { newIdempotencyKey } from "../utils/idempotencyKey.js";
import "../styles/addInventory.css";

export default function AddInventoryPage() {
  // Add Product redirects here with ?product=<id> when the admin tried to
  // create something that already exists in the catalog, so they land
  // straight on restocking it instead of having to find it again themselves.
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  // Branch admins can only ever add inventory for their own branch(es) (the
  // server rejects anything else), so this both defaults to one of theirs
  // and -- in the <select> below -- only their branches are offered.
  const [selectedBranch, setSelectedBranch] = useState(getOwnBranchId);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [color, setColor] = useState("");
  const [dateAdded, setDateAdded] = useState("");
  const [description, setDescription] = useState("");
  const [unitLandedCost, setUnitLandedCost] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [loading, setLoading] = useState(false);

  const COLORS = ["Gold", "Silver", "Bronze", "Black", "White", "Dark Bronze", "Wood", "No Color"];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const productRes = await api.get(
          "/products",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setProducts(productRes.data);

        const preselectId = searchParams.get("product");
        if (preselectId && productRes.data.some((p) => p._id === preselectId)) {
          setSelectedProduct(preselectId);
        }

        const branchRes = await api.get(
          "/admin/branches",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setBranches(branchRes.data);
      } catch (err) {
        console.error("Error loading data:", err);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(
        `/products/${selectedProduct}/add-inventory`,
         {
           branch: selectedBranch,
           quantity: parseInt(quantity),
           color,
           description,
           addedAt: dateAdded,
           ...(unitLandedCost !== "" && { unitLandedCost: Number(unitLandedCost) }),
           ...(supplierRef !== "" && { supplierRef }),
          },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Idempotency-Key": idempotencyKey,
          },
        }
      );
      setIsError(false);
      setMessage("Inventory added!");
      setIdempotencyKey(newIdempotencyKey()); // this restock is done; the next submit is a new one
      setQuantity("");
      setDescription("")
      setUnitLandedCost("");
      setSupplierRef("");
    } catch (err) {
      console.error("Error adding inventory:", err);
      setIsError(true);
      setMessage(err.response?.data?.msg || "Failed to add inventory");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-inventory-page">
      <div className="add-inventory-icon">
        <i className="fas fa-dolly"></i>
      </div>
      <h2>Add Inventory to Existing Product</h2>

      {message && (
        <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>
          {message}
        </div>
      )}

      <form className="inventory-form" onSubmit={handleSubmit}>
        <div className="inventory-form-row">
          <div className="inventory-form-field">
            <label>Product</label>
            <SearchableSelect
              options={products.map((p) => ({ value: p._id, label: p.name }))}
              value={selectedProduct}
              onChange={setSelectedProduct}
              placeholder="Select Product"
            />
          </div>

          <div className="inventory-form-field">
            <label>Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              required
            >
              <option value="">Select</option>
              {branches
                .filter((b) => isOwnBranch(b._id))
                .map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="inventory-form-row">
          <div className="inventory-form-field">
            <label>Color</label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              required
            >
            <option value="">Select Color</option>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
              ))}
            </select>
          </div>

          <div className="inventory-form-field">
            <label>Quantity</label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 20"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="inventory-form-field">
          <label>Stock Date</label>
          <input
            type="date"
            value={dateAdded}
            onChange={(e) => setDateAdded(e.target.value)}
            required
          />
        </div>

        <div className="inventory-form-row">
          <div className="inventory-form-field">
            <label>Unit Landed Cost (₦, optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 4500"
              value={unitLandedCost}
              onChange={(e) => setUnitLandedCost(e.target.value)}
            />
          </div>

          <div className="inventory-form-field">
            <label>Supplier Reference (optional)</label>
            <input
              type="text"
              placeholder="e.g. invoice #, supplier name"
              value={supplierRef}
              onChange={(e) => setSupplierRef(e.target.value)}
            />
          </div>
        </div>
        <p className="inventory-form-hint">
          Leave cost blank if you don't know it yet — this batch will be recorded at ₦0 and
          marked as an estimated cost, and profit/turnover reports will flag it as such.
        </p>

        <div className="inventory-form-field">
          <label>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. supplier delivery, batch note..."
            rows="3"
          />
        </div>

        <button className="btn-primary" type="submit" disabled={loading}>
          <i className="fas fa-plus"></i> {loading ? "Adding..." : "Add Inventory"}
        </button>
      </form>
    </div>
  );
}
