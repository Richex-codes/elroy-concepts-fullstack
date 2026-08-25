import React, { useEffect, useState } from "react";
import api from "../api/axios";
import ReportActions from "./ReportActions.jsx";
import SearchableSelect from "./SearchableSelect.jsx";
import { getOwnBranchId, isOwnBranch } from "../utils/authUser.js";
import { newIdempotencyKey } from "../utils/idempotencyKey.js";
import { loadDraft, saveDraft, clearDraft } from "../utils/formDraft.js";
import "../styles/AddSales.css";

const DRAFT_KEY = "addSales";

export default function AddSales() {
  // Everything a half-built sale needs to pick back up where the admin left
  // off if they navigate away (e.g. to check something on the dashboard)
  // before submitting -- read once per mount, each field's useState below
  // only consumes its initial value on the very first render anyway.
  const draft = loadDraft(DRAFT_KEY) || {};

  const [products, setProducts] = useState([]);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [customerName, setCustomerName] = useState(draft.customerName ?? "");
  // Branch admins can only ever record sales for their own branch (the
  // server rejects anything else), so this both defaults to it and --
  // below, in `branches` -- is the only option they're offered.
  const [branch, setBranch] = useState(draft.branch ?? getOwnBranchId());
  const [amountPaid, setAmountPaid] = useState(draft.amountPaid ?? "");
  const [paymentMethod, setPaymentMethod] = useState(draft.paymentMethod ?? "");
  const [saleDate, setSaleDate] = useState(
    draft.saleDate ?? new Date().toISOString().split("T")[0]
  );

  const PAYMENT_METHODS = [
    { value: "cash", label: "Cash" },
    { value: "transfer", label: "Transfer" },
    { value: "pos", label: "POS" },
    { value: "cheque", label: "Cheque" },
  ];

  // the line item currently being configured, before it's added to `items`
  const [draftProduct, setDraftProduct] = useState(draft.draftProduct ?? "");
  const [draftColor, setDraftColor] = useState(draft.draftColor ?? "");
  // Pipes are only ever sold as a full stick or exactly half of one -- never
  // a custom cut. Stock isn't tracked by length at all, so staff just pick
  // Full or Half; for Half, they additionally type in the length of the
  // stick being cut (never recorded when it was stocked), which sizes the
  // remnant the sale leaves behind.
  const [draftCutType, setDraftCutType] = useState(draft.draftCutType ?? "");
  const [draftSaleLength, setDraftSaleLength] = useState(draft.draftSaleLength ?? "");
  const [draftQuantity, setDraftQuantity] = useState(draft.draftQuantity ?? "");
  const [draftRate, setDraftRate] = useState(draft.draftRate ?? "");
  const [draftAmount, setDraftAmount] = useState(draft.draftAmount ?? "");

  const formatNaira = (value) =>
    `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

  // Rate is optional. When it's set (alongside a quantity), amount is
  // derived automatically; leave rate blank to type a total manually (e.g.
  // a negotiated lump sum with no clean per-unit price). A full stick has no
  // known length to price by the meter, so its rate is flat per stick, same
  // as a piece product; a half stick's rate is per meter, scaled by the
  // half-length being sold (isPipeProduct/draftPieceLength are declared
  // further down, but this closure only reads them once the handler
  // actually fires, by which point the render that defined them has already
  // completed).
  const handleDraftQuantityChange = (value) => {
    setDraftQuantity(value);
    if (draftRate !== "" && value !== "") {
      const unitLength = isPipeProduct && draftCutType === "half" ? draftPieceLength : 1;
      setDraftAmount(String(Number(value) * Number(draftRate) * unitLength));
    }
  };

  const handleDraftRateChange = (value) => {
    setDraftRate(value);
    if (value !== "" && draftQuantity !== "") {
      const unitLength = isPipeProduct && draftCutType === "half" ? draftPieceLength : 1;
      setDraftAmount(String(Number(draftQuantity) * Number(value) * unitLength));
    }
  };

  // confirmed line items for this sale
  const [items, setItems] = useState(draft.items ?? []);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [itemMessage, setItemMessage] = useState("");
  const [lastSale, setLastSale] = useState(null);

  // Keeps the draft in sync as the admin fills the form out, so navigating
  // away and back (or an accidental reload) doesn't lose an unsubmitted
  // sale. Cleared on successful submit further down.
  useEffect(() => {
    saveDraft(DRAFT_KEY, {
      customerName,
      branch,
      amountPaid,
      paymentMethod,
      saleDate,
      items,
      draftProduct,
      draftColor,
      draftCutType,
      draftSaleLength,
      draftQuantity,
      draftRate,
      draftAmount,
    });
  }, [
    customerName,
    branch,
    amountPaid,
    paymentMethod,
    saleDate,
    items,
    draftProduct,
    draftColor,
    draftCutType,
    draftSaleLength,
    draftQuantity,
    draftRate,
    draftAmount,
  ]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get("/products", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        setProducts(res.data);
      } catch (err) {
        console.error("Error loading products:", err);
      }
    };

    fetchProducts();
  }, []);

  // only products with actual stock (qty > 0) at the selected branch
  const availableProducts = branch
    ? products.filter((p) =>
        p.inventory.some((inv) => inv.branch._id === branch && inv.quantity > 0)
      )
    : [];

  const branches = [
    ...new Map(
      products.flatMap((p) => p.inventory.map((inv) => [inv.branch._id, inv.branch]))
    ).values(),
  ].filter((b) => isOwnBranch(b._id));

  const selectedProduct = products.find((p) => p._id === draftProduct);
  const isPipeProduct = selectedProduct?.unitType === "length";

  // only colors with actual combined stock (qty > 0) for this product/branch
  const availableColors = (() => {
    if (!selectedProduct || !branch) return [];
    const qtyByColor = {};
    selectedProduct.inventory
      .filter((inv) => inv.branch._id === branch)
      .forEach((inv) => {
        qtyByColor[inv.color] = (qtyByColor[inv.color] || 0) + inv.quantity;
      });
    return Object.keys(qtyByColor).filter((color) => qtyByColor[color] > 0);
  })();

  // Quantity of this exact product/color already staged in the items list
  // AND drawn from the fresh (length-less) stock pool -- a regular piece
  // product's whole stock, or a pipe's "Full" stock -- so adding a second
  // line for the same product/color can't let the sale claim more than is
  // actually in stock.
  const alreadyStagedQty = (productId, color) =>
    items
      .filter((item) => item.productId === productId && item.color === color && item.cutType !== "half")
      .reduce((total, item) => total + item.quantitySold, 0);

  // Pieces of this exact product/color already staged as a "Half" sale of
  // this exact stick length -- a distinct stock pool (remnants at half that
  // length, plus fresh stock) from a differently-lengthed half sale of the
  // same product/color, so it's tracked separately from alreadyStagedQty.
  const alreadyStagedHalfQty = (productId, color, stickLength) =>
    items
      .filter(
        (item) =>
          item.productId === productId &&
          item.color === color &&
          item.cutType === "half" &&
          item.length === stickLength
      )
      .reduce((total, item) => total + item.quantitySold, 0);

  const draftSaleLengthNum = Number(draftSaleLength) || 0;
  // Length of ONE piece being sold: only meaningful for "Half" (exactly
  // half the stick length just entered). A "Full" sale's stick length was
  // never recorded, so there's nothing to derive here for it.
  const draftPieceLength = draftCutType === "half" ? draftSaleLengthNum / 2 : null;

  const availableStock = (() => {
    if (!selectedProduct || !branch || !draftColor) return 0;
    if (isPipeProduct) {
      if (!draftCutType) return 0;
      // Fresh stock: no length recorded, not a remnant -- what "Full" sells
      // from, and what "Half" falls back to cutting once a matching remnant
      // runs out.
      const freshQty = selectedProduct.inventory
        .filter(
          (inv) => inv.branch._id === branch && inv.color === draftColor && !inv.isRemnant && inv.length == null
        )
        .reduce((total, inv) => total + inv.quantity, 0);

      if (draftCutType === "full") {
        return freshQty - alreadyStagedQty(selectedProduct._id, draftColor);
      }

      if (!draftSaleLengthNum) return 0;
      const remnantQty = selectedProduct.inventory
        .filter(
          (inv) =>
            inv.branch._id === branch && inv.color === draftColor && inv.isRemnant && inv.length === draftPieceLength
        )
        .reduce((total, inv) => total + inv.quantity, 0);
      return (
        remnantQty + freshQty - alreadyStagedHalfQty(selectedProduct._id, draftColor, draftSaleLengthNum)
      );
    }
    return (
      selectedProduct.inventory
        .filter((inv) => inv.branch._id === branch && inv.color === draftColor)
        .reduce((total, inv) => total + inv.quantity, 0) -
      alreadyStagedQty(selectedProduct._id, draftColor)
    );
  })();

  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);

  const handleBranchChange = (e) => {
    setBranch(e.target.value);
    setDraftProduct("");
    setDraftColor("");
    setDraftCutType("");
    setDraftSaleLength("");
    setDraftQuantity("");
    setDraftRate("");
    setDraftAmount("");
    setItems([]); // items are tied to the branch they were picked against
  };

  const handleAddItem = () => {
    setItemMessage("");

    if (
      !draftProduct ||
      !draftColor ||
      (isPipeProduct && !draftCutType) ||
      (isPipeProduct && draftCutType === "half" && !draftSaleLength)
    ) {
      setItemMessage(
        isPipeProduct
          ? "Select a product, color, and Full or Half (Half also needs the stick's length)."
          : "Select a product and color."
      );
      return;
    }
    const qty = Number(draftQuantity);
    if (!qty || qty <= 0) {
      setItemMessage("Enter a valid quantity.");
      return;
    }
    if (qty > availableStock) {
      setItemMessage("Cannot add more than available stock.");
      return;
    }
    const lineAmount = Number(draftAmount);
    if (!draftAmount || lineAmount < 0) {
      setItemMessage("Enter a valid amount for this item.");
      return;
    }
    if (draftRate !== "" && Number(draftRate) < 0) {
      setItemMessage("Rate can't be negative.");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        productId: selectedProduct._id,
        productName: selectedProduct.name,
        color: draftColor,
        ...(isPipeProduct && {
          cutType: draftCutType,
          ...(draftCutType === "half" && { length: draftSaleLengthNum }),
        }),
        quantitySold: qty,
        rate: draftRate !== "" ? Number(draftRate) : undefined,
        amount: lineAmount,
      },
    ]);

    setDraftProduct("");
    setDraftColor("");
    setDraftCutType("");
    setDraftSaleLength("");
    setDraftQuantity("");
    setDraftRate("");
    setDraftAmount("");
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setIsError(false);
    setLastSale(null);

    if (!customerName || !branch) {
      setIsError(true);
      setMessage("Enter a customer name and select a branch.");
      return;
    }
    if (items.length === 0) {
      setIsError(true);
      setMessage("Add at least one item to this sale.");
      return;
    }
    if (!paymentMethod) {
      setIsError(true);
      setMessage("Select a payment method.");
      return;
    }

    const validAmountPaid =
      !amountPaid || Number(amountPaid) < 0 ? 0 : Number(amountPaid);

    setLoading(true);
    try {
      const saleRes = await api.post(
        "/admin/sales",
        {
          customerName,
          branch,
          items: items.map((i) => ({
            productId: i.productId,
            color: i.color,
            length: i.length,
            cutType: i.cutType,
            quantitySold: i.quantitySold,
            rate: i.rate,
            amount: i.amount,
          })),
          amountPaid: validAmountPaid,
          paymentMethod,
          saleDate,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Idempotency-Key": idempotencyKey,
          },
        }
      );

      setIsError(false);
      setMessage("Sale recorded successfully!");
      setLastSale(saleRes.data.sale);
      setIdempotencyKey(newIdempotencyKey()); // this sale is done; the next submit is a new one
      clearDraft(DRAFT_KEY);

      // Reset form
      setCustomerName("");
      setBranch("");
      setItems([]);
      setAmountPaid("");
      setPaymentMethod("");
      setSaleDate(new Date().toISOString().split("T")[0]);

      const res = await api.get("/products", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setProducts(res.data);
    } catch (err) {
      console.error("Error recording sale:", err);
      setIsError(true);
      setMessage(err.response?.data?.message || "Failed to record sale.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="AddSales-page">
      <div className="add-sales-icon">
        <i className="fas fa-cash-register"></i>
      </div>
      <h2>Record Sale</h2>

      {message && (
        <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>
          {message}
        </div>
      )}

      {lastSale && (
        <div className="invoice-actions-wrapper">
          <p className="invoice-actions-label">
            Invoice for {lastSale.customerName}
          </p>
          <ReportActions
            pdfEndpoint={`/admin/sales/${lastSale._id}/invoice`}
            emailEndpoint={`/admin/sales/${lastSale._id}/invoice/email`}
            fileName={`Invoice-${lastSale._id}`}
          />
        </div>
      )}

      <form className="sales-form" onSubmit={handleSubmit}>
        <div className="sales-form-row">
        <div className="sales-form-field">
        <label>Customer Name</label>
        <input
          type="text"
          placeholder="Customer's full name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          required
        />
        </div>

        <div className="sales-form-field">
        <label>Branch</label>
        <select value={branch} onChange={handleBranchChange} required>
          <option value="">Select Branch</option>
          {branches.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </select>
        </div>
        </div>

        {branch && (
          <div className="sale-items-builder">
            <h4>Add Items</h4>

            <div className="sale-item-draft">
              <SearchableSelect
                options={availableProducts.map((p) => ({ value: p._id, label: p.name }))}
                value={draftProduct}
                onChange={(newValue) => {
                  setDraftProduct(newValue);
                  setDraftColor("");
                  setDraftCutType("");
                  setDraftSaleLength("");
                  setDraftQuantity("");
                  setDraftRate("");
                  setDraftAmount("");
                }}
                placeholder="Select Product"
              />

              <select
                value={draftColor}
                onChange={(e) => {
                  setDraftColor(e.target.value);
                  setDraftCutType("");
                  setDraftSaleLength("");
                  setDraftQuantity("");
                  setDraftRate("");
                  setDraftAmount("");
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

              {isPipeProduct && (
                <select
                  value={draftCutType}
                  onChange={(e) => {
                    setDraftCutType(e.target.value);
                    setDraftSaleLength("");
                    setDraftQuantity("");
                    setDraftRate("");
                    setDraftAmount("");
                  }}
                  disabled={!draftColor}
                >
                  <option value="">Full or Half?</option>
                  <option value="full">Full stick</option>
                  <option value="half">Half stick</option>
                </select>
              )}

              {isPipeProduct && draftCutType === "half" && (
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="Length of stick being cut (m)"
                  value={draftSaleLength}
                  onChange={(e) => {
                    setDraftSaleLength(e.target.value);
                    setDraftQuantity("");
                    setDraftRate("");
                    setDraftAmount("");
                  }}
                />
              )}

              <input
                type="number"
                min="1"
                max={availableStock || undefined}
                placeholder={isPipeProduct ? "Pieces" : "Qty"}
                value={draftQuantity}
                onChange={(e) => handleDraftQuantityChange(e.target.value)}
                disabled={
                  isPipeProduct ? !draftCutType || (draftCutType === "half" && !draftSaleLength) : !draftColor
                }
              />

              <input
                type="number"
                min="0"
                placeholder={
                  isPipeProduct && draftCutType === "half" ? "Rate per meter (optional)" : "Rate (optional)"
                }
                value={draftRate}
                onChange={(e) => handleDraftRateChange(e.target.value)}
                disabled={
                  isPipeProduct ? !draftCutType || (draftCutType === "half" && !draftSaleLength) : !draftColor
                }
              />

              <input
                type="number"
                min="0"
                placeholder="Amount"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
              />

              <button type="button" onClick={handleAddItem} className="btn-add-item">
                + Add Item
              </button>
            </div>

            {draftColor &&
              (!isPipeProduct || (draftCutType === "full" || (draftCutType === "half" && draftSaleLength))) && (
                <div className="stock-display">
                  Available Stock: {availableStock}
                  {isPipeProduct
                    ? ` piece(s) (${draftCutType === "half" ? `Half of ${draftSaleLength}m` : "Full"})`
                    : ""}
                </div>
              )}

            {itemMessage && <p className="error-message">{itemMessage}</p>}

            {items.length > 0 && (
              <table className="sale-items-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Color / Length</th>
                    <th>Qty</th>
                    <th className="col-right">Rate</th>
                    <th className="col-right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td>{item.productName}</td>
                      <td>
                        {item.cutType != null
                          ? `${item.color} · ${item.cutType === "half" ? `Half ${item.length}m` : "Full"}`
                          : item.color}
                      </td>
                      <td>{item.quantitySold}</td>
                      <td className="amount-cell">
                        {item.rate != null ? formatNaira(item.rate) : "-"}
                      </td>
                      <td className="amount-cell">{formatNaira(item.amount)}</td>
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
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total</td>
                    <td colSpan={2} className="amount-cell">{formatNaira(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        <div className="sales-form-row">
        <div className="sales-form-field">
        <label>Payment Method</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          required
        >
          <option value="">Select Payment Method</option>
          {PAYMENT_METHODS.map((pm) => (
            <option key={pm.value} value={pm.value}>
              {pm.label}
            </option>
          ))}
        </select>
        </div>

        <div className="sales-form-field">
        <label>Amount Paid</label>
        <input
          type="number"
          min="0"
          placeholder="0 (leave blank if nothing paid yet)"
          value={amountPaid}
          onChange={(e) => setAmountPaid(e.target.value)}
        />
        </div>
        </div>

        <div className="sales-form-row">
        <div className="sales-form-field">
        <label>Sale Date</label>
        <input
          type="date"
          value={saleDate}
          onChange={(e) => setSaleDate(e.target.value)}
          required
        />
        </div>
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          <i className="fas fa-receipt"></i> {loading ? "Recording..." : "Record Sale"}
        </button>
      </form>
    </div>
  );
}
