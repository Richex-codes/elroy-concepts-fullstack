import React, { useEffect, useState } from "react";
import api from "../api/axios";
import SearchableSelect from "./SearchableSelect.jsx";
import { getOwnBranchId, isOwnBranch } from "../utils/authUser.js";
import { newIdempotencyKey } from "../utils/idempotencyKey.js";
import { loadDraft, saveDraft, clearDraft } from "../utils/formDraft.js";
import "../styles/AddTransfer.css";

const DRAFT_KEY = "addTransfer";

export default function AddTransfer() {
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const draft = loadDraft(DRAFT_KEY) || {};

  // Branch admins can only ever send stock out of their own branch (the
  // server rejects anything else), so this both defaults to one of theirs
  // and -- in the "From" dropdown below -- only their branches are offered.
  // "To" isn't restricted the same way: sending stock TO a branch you don't
  // manage is exactly the point.
  const [fromBranch, setFromBranch] = useState(draft.fromBranch ?? getOwnBranchId());
  const [toBranch, setToBranch] = useState(draft.toBranch ?? "");
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [transferDate, setTransferDate] = useState(
    draft.transferDate ?? new Date().toISOString().split("T")[0]
  );

  const [draftProduct, setDraftProduct] = useState(draft.draftProduct ?? "");
  const [draftColor, setDraftColor] = useState(draft.draftColor ?? "");
  const [draftQuantity, setDraftQuantity] = useState(draft.draftQuantity ?? "");

  const [items, setItems] = useState(draft.items ?? []);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [itemMessage, setItemMessage] = useState("");

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
      } catch (err) {
        console.error("Error loading data:", err);
      }
    };
    fetchData();
  }, []);

  // Keeps the draft in sync as the admin fills the form out, so navigating
  // away and back (or an accidental reload) doesn't lose an unsubmitted
  // transfer. Cleared on successful submit further down.
  useEffect(() => {
    saveDraft(DRAFT_KEY, {
      fromBranch,
      toBranch,
      notes,
      transferDate,
      draftProduct,
      draftColor,
      draftQuantity,
      items,
    });
  }, [fromBranch, toBranch, notes, transferDate, draftProduct, draftColor, draftQuantity, items]);

  // Only products with actual stock at the sending branch.
  const availableProducts = fromBranch
    ? products.filter((p) => p.inventory.some((inv) => inv.branch._id === fromBranch && inv.quantity > 0))
    : [];

  const selectedProduct = products.find((p) => p._id === draftProduct);

  const availableColors = (() => {
    if (!selectedProduct || !fromBranch) return [];
    const qtyByColor = {};
    selectedProduct.inventory
      .filter((inv) => inv.branch._id === fromBranch && !inv.isRemnant && inv.length == null)
      .forEach((inv) => {
        qtyByColor[inv.color] = (qtyByColor[inv.color] || 0) + inv.quantity;
      });
    return Object.keys(qtyByColor).filter((color) => qtyByColor[color] > 0);
  })();

  // Quantity of this exact product/color already staged in the items list,
  // so adding a second line for the same product/color can't let the
  // transfer claim more than is actually at the sending branch.
  const alreadyStagedQty = (productId, color) =>
    items
      .filter((item) => item.productId === productId && item.color === color)
      .reduce((total, item) => total + item.quantity, 0);

  const availableStock = (() => {
    if (!selectedProduct || !fromBranch || !draftColor) return 0;
    return (
      selectedProduct.inventory
        .filter(
          (inv) =>
            inv.branch._id === fromBranch && inv.color === draftColor && !inv.isRemnant && inv.length == null
        )
        .reduce((total, inv) => total + inv.quantity, 0) - alreadyStagedQty(selectedProduct._id, draftColor)
    );
  })();

  const handleFromBranchChange = (e) => {
    setFromBranch(e.target.value);
    setDraftProduct("");
    setDraftColor("");
    setDraftQuantity("");
    setItems([]); // items are tied to the branch stock they were picked against
  };

  const handleAddItem = () => {
    setItemMessage("");

    if (!draftProduct || !draftColor) {
      setItemMessage("Select a product and color.");
      return;
    }
    const qty = Number(draftQuantity);
    if (!qty || qty <= 0) {
      setItemMessage("Enter a valid quantity.");
      return;
    }
    if (qty > availableStock) {
      setItemMessage("Cannot transfer more than available stock.");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        productId: selectedProduct._id,
        productName: selectedProduct.name,
        color: draftColor,
        quantity: qty,
      },
    ]);

    setDraftProduct("");
    setDraftColor("");
    setDraftQuantity("");
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setIsError(false);

    if (!fromBranch || !toBranch) {
      setIsError(true);
      setMessage("Select both branches.");
      return;
    }
    if (fromBranch === toBranch) {
      setIsError(true);
      setMessage("The two branches must be different.");
      return;
    }
    if (items.length === 0) {
      setIsError(true);
      setMessage("Add at least one item to this transfer.");
      return;
    }

    setLoading(true);
    try {
      await api.post(
        "/admin/transfers",
        {
          fromBranch,
          toBranch,
          items: items.map((i) => ({
            productId: i.productId,
            color: i.color,
            quantity: i.quantity,
          })),
          notes,
          transferDate,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Idempotency-Key": idempotencyKey,
          },
        }
      );

      setIsError(false);
      setMessage("Stock transferred successfully!");
      setIdempotencyKey(newIdempotencyKey()); // this transfer is done; the next submit is a new one
      clearDraft(DRAFT_KEY);

      setToBranch("");
      setItems([]);
      setNotes("");
      setTransferDate(new Date().toISOString().split("T")[0]);

      const res = await api.get("/products", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setProducts(res.data);
    } catch (err) {
      console.error("Error recording transfer:", err);
      setIsError(true);
      setMessage(err.response?.data?.message || "Failed to record transfer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="AddTransfer-page">
      <div className="add-transfer-icon">
        <i className="fas fa-right-left"></i>
      </div>
      <h2>Transfer Stock</h2>

      {message && (
        <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>{message}</div>
      )}

      <form className="transfer-form" onSubmit={handleSubmit}>
        <div className="transfer-form-row">
          <div className="transfer-form-field">
            <label>From Branch</label>
            <select value={fromBranch} onChange={handleFromBranchChange} required>
              <option value="">Select Branch</option>
              {branches
                .filter((b) => isOwnBranch(b._id))
                .map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="transfer-form-field">
            <label>To Branch</label>
            <select value={toBranch} onChange={(e) => setToBranch(e.target.value)} required>
              <option value="">Select Branch</option>
              {branches
                .filter((b) => b._id !== fromBranch)
                .map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {fromBranch && toBranch && (
          <div className="transfer-items-builder">
            <h4>Add Items</h4>

            <div className="transfer-item-draft">
              <SearchableSelect
                options={availableProducts.map((p) => ({ value: p._id, label: p.name }))}
                value={draftProduct}
                onChange={(newValue) => {
                  setDraftProduct(newValue);
                  setDraftColor("");
                  setDraftQuantity("");
                }}
                placeholder="Select Product"
              />

              <select
                value={draftColor}
                onChange={(e) => {
                  setDraftColor(e.target.value);
                  setDraftQuantity("");
                }}
                disabled={!draftProduct}
              >
                <option value="">Select Color</option>
                {availableColors.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="1"
                max={availableStock || undefined}
                placeholder="Qty"
                value={draftQuantity}
                onChange={(e) => setDraftQuantity(e.target.value)}
                disabled={!draftColor}
              />

              <button type="button" onClick={handleAddItem} className="btn-add-item">
                + Add Item
              </button>
            </div>

            {draftColor && (
              <div className="stock-display">Available at sending branch: {availableStock}</div>
            )}

            {itemMessage && <p className="error-message">{itemMessage}</p>}

            {items.length > 0 && (
              <table className="transfer-items-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Color</th>
                    <th className="col-right">Qty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td>{item.productName}</td>
                      <td>{item.color}</td>
                      <td className="col-right">{item.quantity}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-remove-item"
                          onClick={() => handleRemoveItem(index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="transfer-form-row">
          <div className="transfer-form-field">
            <label>Transfer Date</label>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="transfer-form-field">
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. reason for the transfer, who requested it..."
            rows="3"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          <i className="fas fa-right-left"></i> {loading ? "Recording..." : "Record Transfer"}
        </button>
      </form>
    </div>
  );
}
