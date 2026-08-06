import React, { useEffect, useState } from "react";
import api from "../api/axios";
import ReportActions from "./ReportActions.jsx";
import { getOwnBranchId, isOwnBranch } from "../utils/authUser.js";
import { newIdempotencyKey } from "../utils/idempotencyKey.js";
import "../styles/AddSales.css";

export default function AddSales() {
  const [products, setProducts] = useState([]);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [customerName, setCustomerName] = useState("");
  // Branch admins can only ever record sales for their own branch (the
  // server rejects anything else), so this both defaults to it and --
  // below, in `branches` -- is the only option they're offered.
  const [branch, setBranch] = useState(getOwnBranchId);
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const PAYMENT_METHODS = [
    { value: "cash", label: "Cash" },
    { value: "transfer", label: "Transfer" },
    { value: "pos", label: "POS" },
    { value: "cheque", label: "Cheque" },
  ];

  // the line item currently being configured, before it's added to `items`
  const [draftProduct, setDraftProduct] = useState("");
  const [draftColor, setDraftColor] = useState("");
  // Pipes are only ever sold as a full stick or exactly half of one --
  // never a custom cut -- so staff pick which stick length in stock
  // they're selling from, then whether it's Full or Half of that stick.
  const [draftStickLength, setDraftStickLength] = useState("");
  const [draftCutType, setDraftCutType] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("");
  const [draftRate, setDraftRate] = useState("");
  const [draftAmount, setDraftAmount] = useState("");

  const formatNaira = (value) =>
    `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

  // Rate is optional. When it's set (alongside a quantity), amount is
  // derived automatically; leave rate blank to type a total manually
  // (e.g. a negotiated lump sum with no clean per-unit price). For pipes,
  // rate is per meter, so the derived amount also factors in the length of
  // ONE piece -- half the stick length, or the whole thing (isPipeProduct/
  // draftPieceLength are declared further down, but this closure only reads
  // them once the handler actually fires, by which point the render that
  // defined them has already completed).
  const handleDraftQuantityChange = (value) => {
    setDraftQuantity(value);
    if (draftRate !== "" && value !== "") {
      const unitLength = isPipeProduct ? draftPieceLength : 1;
      setDraftAmount(String(Number(value) * Number(draftRate) * unitLength));
    }
  };

  const handleDraftRateChange = (value) => {
    setDraftRate(value);
    if (value !== "" && draftQuantity !== "") {
      const unitLength = isPipeProduct ? draftPieceLength : 1;
      setDraftAmount(String(Number(draftQuantity) * Number(value) * unitLength));
    }
  };

  // confirmed line items for this sale
  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [itemMessage, setItemMessage] = useState("");
  const [lastSale, setLastSale] = useState(null);

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

  // Quantity of this exact product/color already staged in the items list,
  // so adding a second line for the same product/color can't let the sale
  // claim more than is actually in stock.
  const alreadyStagedQty = (productId, color) =>
    items
      .filter((item) => item.productId === productId && item.color === color && item.length == null)
      .reduce((total, item) => total + item.quantitySold, 0);

  // Pieces of this exact product/color/piece-length already staged -- same
  // purpose as alreadyStagedQty above, keyed by color+length since pipe
  // stock isn't a fixed enum the way piece colors are. Full and Half of the
  // same stick land under different piece lengths (e.g. 6m vs 3m), so they
  // never collide here.
  const alreadyStagedPieces = (productId, color, len) =>
    items
      .filter((item) => item.productId === productId && item.color === color && item.length === len)
      .reduce((total, item) => total + item.quantitySold, 0);

  // Distinct stick lengths in stock for this product/branch/color. A
  // length can be sold "Full" as long as any stock exists at it; "Half" is
  // only offered if a FRESH (non-remnant) stick of that length exists --
  // pipes here are only ever sold whole or exactly halved, never a further
  // cut of an already-halved offcut.
  const stickLengthOptions = (() => {
    if (!selectedProduct || !branch || !draftColor || !isPipeProduct) return [];
    const lines = selectedProduct.inventory.filter(
      (inv) => inv.branch._id === branch && inv.color === draftColor && inv.quantity > 0
    );
    const freshLengths = new Set(lines.filter((l) => !l.isRemnant).map((l) => l.length));
    return [...new Set(lines.map((l) => l.length))]
      .sort((a, b) => b - a)
      .map((length) => ({ length, canHalf: freshLengths.has(length) }));
  })();

  const draftStickLengthNum = Number(draftStickLength) || 0;
  const draftCanHalf = stickLengthOptions.find((o) => o.length === draftStickLengthNum)?.canHalf;
  // Length of ONE piece being sold: the whole stick, or exactly half of it.
  const draftPieceLength = draftCutType === "half" ? draftStickLengthNum / 2 : draftStickLengthNum;

  const availableStock = (() => {
    if (!selectedProduct || !branch || !draftColor) return 0;
    if (isPipeProduct) {
      if (!draftStickLengthNum || !draftCutType) return 0;
      const linesAt = (len) =>
        selectedProduct.inventory
          .filter((inv) => inv.branch._id === branch && inv.color === draftColor && inv.length === len)
          .reduce((total, inv) => total + inv.quantity, 0);
      // Half can also be fulfilled by cutting a fresh whole stick, so its
      // available count includes stock at the full stick length too.
      const total =
        draftCutType === "half" ? linesAt(draftPieceLength) + linesAt(draftStickLengthNum) : linesAt(draftPieceLength);
      return total - alreadyStagedPieces(selectedProduct._id, draftColor, draftPieceLength);
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
    setDraftStickLength("");
    setDraftCutType("");
    setDraftQuantity("");
    setDraftRate("");
    setDraftAmount("");
    setItems([]); // items are tied to the branch they were picked against
  };

  const handleAddItem = () => {
    setItemMessage("");

    if (!draftProduct || !draftColor || (isPipeProduct && (!draftStickLength || !draftCutType))) {
      setItemMessage(
        isPipeProduct ? "Select a product, color, stick length, and Full or Half." : "Select a product and color."
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
        ...(isPipeProduct && { length: draftPieceLength, cutType: draftCutType }),
        quantitySold: qty,
        rate: draftRate !== "" ? Number(draftRate) : undefined,
        amount: lineAmount,
      },
    ]);

    setDraftProduct("");
    setDraftColor("");
    setDraftStickLength("");
    setDraftCutType("");
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
      <p className="add-sales-subtitle">
        One customer, one or more products, one invoice.
      </p>

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
              <select
                value={draftProduct}
                onChange={(e) => {
                  setDraftProduct(e.target.value);
                  setDraftColor("");
                  setDraftStickLength("");
                  setDraftCutType("");
                  setDraftQuantity("");
                  setDraftRate("");
                  setDraftAmount("");
                }}
              >
                <option value="">Select Product</option>
                {availableProducts.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={draftColor}
                onChange={(e) => {
                  setDraftColor(e.target.value);
                  setDraftStickLength("");
                  setDraftCutType("");
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
                  value={draftStickLength}
                  onChange={(e) => {
                    setDraftStickLength(e.target.value);
                    setDraftCutType("");
                    setDraftQuantity("");
                    setDraftRate("");
                    setDraftAmount("");
                  }}
                  disabled={!draftColor}
                >
                  <option value="">Stick Length</option>
                  {stickLengthOptions.map((opt) => (
                    <option key={opt.length} value={opt.length}>
                      {opt.length}m
                    </option>
                  ))}
                </select>
              )}

              {isPipeProduct && (
                <select
                  value={draftCutType}
                  onChange={(e) => {
                    setDraftCutType(e.target.value);
                    setDraftQuantity("");
                    setDraftRate("");
                    setDraftAmount("");
                  }}
                  disabled={!draftStickLength}
                >
                  <option value="">Full or Half?</option>
                  <option value="full">Full ({draftStickLengthNum}m)</option>
                  {draftCanHalf && <option value="half">Half ({draftStickLengthNum / 2}m)</option>}
                </select>
              )}

              <input
                type="number"
                min="1"
                max={availableStock || undefined}
                placeholder={isPipeProduct ? "Pieces" : "Qty"}
                value={draftQuantity}
                onChange={(e) => handleDraftQuantityChange(e.target.value)}
                disabled={isPipeProduct ? !draftCutType : !draftColor}
              />

              <input
                type="number"
                min="0"
                placeholder={isPipeProduct ? "Rate per meter (optional)" : "Rate (optional)"}
                value={draftRate}
                onChange={(e) => handleDraftRateChange(e.target.value)}
                disabled={isPipeProduct ? !draftCutType : !draftColor}
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

            {draftColor && (!isPipeProduct || draftCutType) && (
              <div className="stock-display">
                Available Stock: {availableStock}
                {isPipeProduct ? ` piece(s) at ${draftPieceLength}m (${draftCutType === "half" ? "Half" : "Full"})` : ""}
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
                        {item.length != null
                          ? `${item.color} · ${item.cutType === "half" ? "Half" : "Full"} ${item.length}m`
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
