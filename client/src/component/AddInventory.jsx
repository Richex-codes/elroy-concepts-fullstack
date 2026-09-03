import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios.js";
import SearchableSelect from "./SearchableSelect.jsx";
import { getOwnBranchId, isOwnBranch } from "../utils/authUser.js";
import { newIdempotencyKey } from "../utils/idempotencyKey.js";
import { loadDraft, saveDraft, clearDraft } from "../utils/formDraft.js";
import "../styles/addInventory.css";

const DRAFT_KEY = "addInventory";

// The batch with the latest arrivalDate across every inventory line of this
// product (any branch/color) -- mirrors the server's mostRecentBatch in
// routes/product.js, since that's what actually gets used as the cost when
// a restock doesn't specify a new one.
function mostRecentBatch(product) {
  let latest = null;
  for (const line of product.inventory || []) {
    for (const batch of line.batches || []) {
      if (!latest || new Date(batch.arrivalDate) > new Date(latest.arrivalDate)) {
        latest = batch;
      }
    }
  }
  return latest;
}

export default function AddInventoryPage() {
  // Add Product redirects here with ?product=<id> when the admin tried to
  // create something that already exists in the catalog, so they land
  // straight on restocking it instead of having to find it again themselves.
  const [searchParams] = useSearchParams();
  // Lets an unsubmitted restock survive the admin navigating away and back.
  const draft = loadDraft(DRAFT_KEY) || {};

  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(draft.selectedProduct ?? "");
  // Branch admins can only ever add inventory for their own branch(es) (the
  // server rejects anything else), so this both defaults to one of theirs
  // and -- in the <select> below -- only their branches are offered.
  const [selectedBranch, setSelectedBranch] = useState(draft.selectedBranch ?? getOwnBranchId());
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [quantity, setQuantity] = useState(draft.quantity ?? "");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [color, setColor] = useState(draft.color ?? "");
  const [dateAdded, setDateAdded] = useState(draft.dateAdded ?? "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [unitLandedCost, setUnitLandedCost] = useState(draft.unitLandedCost ?? "");
  const [supplierRef, setSupplierRef] = useState(draft.supplierRef ?? "");
  // True once the admin has explicitly chosen to override an existing
  // known cost -- see costLocked below.
  const [costOverrideUnlocked, setCostOverrideUnlocked] = useState(draft.costOverrideUnlocked ?? false);
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

  // Keeps the draft in sync as the admin fills the form out, so navigating
  // away and back (or an accidental reload) doesn't lose an unsubmitted
  // restock. Cleared on successful submit further down.
  useEffect(() => {
    saveDraft(DRAFT_KEY, {
      selectedProduct,
      selectedBranch,
      quantity,
      color,
      dateAdded,
      description,
      unitLandedCost,
      supplierRef,
      costOverrideUnlocked,
    });
  }, [
    selectedProduct,
    selectedBranch,
    quantity,
    color,
    dateAdded,
    description,
    unitLandedCost,
    supplierRef,
    costOverrideUnlocked,
  ]);

  // Re-lock the cost field (and clear any typed override) whenever the
  // admin actually changes which product they're restocking -- but not on
  // the very first render, since that's just the draft (possibly already
  // unlocked) being restored.
  const skipNextProductReset = useRef(true);
  useEffect(() => {
    if (skipNextProductReset.current) {
      skipNextProductReset.current = false;
      return;
    }
    setCostOverrideUnlocked(false);
    setUnitLandedCost("");
  }, [selectedProduct]);

  const selectedProductObj = products.find((p) => p._id === selectedProduct);
  const existingBatch = selectedProductObj ? mostRecentBatch(selectedProductObj) : null;
  const hasExistingCost = existingBatch != null;
  const costLocked = hasExistingCost && !costOverrideUnlocked;

  // Flags this exact product/branch/color already having a batch dated the
  // same day as the one being entered -- the same mistake as a delivery
  // getting added twice. A warning, not a block: two separate deliveries
  // can genuinely arrive on the same day.
  const possibleDuplicate = (() => {
    if (!selectedProductObj || !selectedBranch || !color || !dateAdded) return null;
    const targetDate = new Date(dateAdded).toDateString();
    for (const line of selectedProductObj.inventory || []) {
      if (line.branch?._id !== selectedBranch || line.color !== color) continue;
      for (const batch of line.batches || []) {
        if (new Date(batch.arrivalDate).toDateString() === targetDate) {
          return { quantity: batch.quantityReceived, date: batch.arrivalDate };
        }
      }
    }
    return null;
  })();

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
           // Locked (showing the existing cost, not overridden) -- leave it
           // out entirely and let the server carry the known cost forward
           // itself, rather than resending a value that's really just a
           // display echo of what it already knows.
           ...(!costLocked && unitLandedCost !== "" && { unitLandedCost: Number(unitLandedCost) }),
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
      clearDraft(DRAFT_KEY);
      setQuantity("");
      setDescription("")
      setUnitLandedCost("");
      setSupplierRef("");
      setCostOverrideUnlocked(false);
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

        {possibleDuplicate && (
          <div className="alert alert-warning">
            {possibleDuplicate.quantity} unit(s) of this product's {color} was already added at
            this branch on {new Date(possibleDuplicate.date).toLocaleDateString()}. Make sure
            this isn't the same delivery being entered twice.
          </div>
        )}

        <div className="inventory-form-row">
          <div className="inventory-form-field">
            <label>Unit Landed Cost (₦{hasExistingCost ? "" : ", optional"})</label>
            <div className="cost-field-with-lock">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 4500"
                value={costLocked ? existingBatch.unitLandedCost : unitLandedCost}
                onChange={(e) => setUnitLandedCost(e.target.value)}
                disabled={costLocked}
              />
              {hasExistingCost && (
                <button
                  type="button"
                  className="btn-toggle-cost-lock"
                  onClick={() => {
                    setCostOverrideUnlocked((prev) => !prev);
                    setUnitLandedCost("");
                  }}
                >
                  {costLocked ? "Change cost" : "Use existing cost"}
                </button>
              )}
            </div>
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
          {hasExistingCost
            ? costLocked
              ? `This product's last known cost is ₦${existingBatch.unitLandedCost.toLocaleString("en-NG")}${
                  existingBatch.costEstimated ? " (estimated)" : ""
                } — it'll be used automatically unless you change it.`
              : "Enter the new cost for this restock, or click \"Use existing cost\" to go back to the known price."
            : "Leave cost blank if you don't know it yet — this batch will be recorded at ₦0 and marked as an estimated cost, and profit/turnover reports will flag it as such."}
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
