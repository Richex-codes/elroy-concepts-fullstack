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
  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // the line item currently being configured, before it's added to `items`
  const [draftProduct, setDraftProduct] = useState("");
  const [draftColor, setDraftColor] = useState("");
  const [draftLength, setDraftLength] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("");
  const [draftRate, setDraftRate] = useState("");
  const [draftAmount, setDraftAmount] = useState("");

  const formatNaira = (value) =>
    `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

  // Rate is optional. When it's set (alongside a quantity), amount is
  // derived automatically; leave rate blank to type a total manually
  // (e.g. a negotiated lump sum with no clean per-unit price). For pipes,
  // rate is per meter, so the derived amount also factors in the length
  // per piece (isPipeProduct/draftLength are declared further down, but
  // this closure only reads them once the handler actually fires, by
  // which point the render that defined them has already completed).
  const handleDraftQuantityChange = (value) => {
    setDraftQuantity(value);
    if (draftRate !== "" && value !== "") {
      const unitLength = isPipeProduct ? Number(draftLength) || 0 : 1;
      setDraftAmount(String(Number(value) * Number(draftRate) * unitLength));
    }
  };

  const handleDraftRateChange = (value) => {
    setDraftRate(value);
    if (value !== "" && draftQuantity !== "") {
      const unitLength = isPipeProduct ? Number(draftLength) || 0 : 1;
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

  // Pieces of this exact product/color/length already staged -- same
  // purpose as alreadyStagedQty above, keyed by color+length since pipe
  // stock isn't a fixed enum the way piece colors are.
  const alreadyStagedPieces = (productId, color, len) =>
    items
      .filter((item) => item.productId === productId && item.color === color && item.length === len)
      .reduce((total, item) => total + item.quantitySold, 0);

  const availableStock = (() => {
    if (!selectedProduct || !branch || !draftColor) return 0;
    if (isPipeProduct) {
      const requestedLength = Number(draftLength);
      if (!draftLength || requestedLength <= 0) return 0;
      // Best-fit: any stick at least this long could supply this piece,
      // mirroring the server's eligiblePipeLines (server/utils/pipeStock.js).
      return (
        selectedProduct.inventory
          .filter(
            (inv) =>
              inv.branch._id === branch &&
              inv.color === draftColor &&
              (inv.length || 0) >= requestedLength
          )
          .reduce((total, inv) => total + inv.quantity, 0) -
        alreadyStagedPieces(selectedProduct._id, draftColor, requestedLength)
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
    setDraftLength("");
    setDraftQuantity("");
    setDraftRate("");
    setDraftAmount("");
    setItems([]); // items are tied to the branch they were picked against
  };

  const handleAddItem = () => {
    setItemMessage("");

    if (!draftProduct || !draftColor || (isPipeProduct && !draftLength)) {
      setItemMessage(isPipeProduct ? "Select a product, color, and length." : "Select a product and color.");
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
        ...(isPipeProduct && { length: Number(draftLength) }),
        quantitySold: qty,
        rate: draftRate !== "" ? Number(draftRate) : undefined,
        amount: lineAmount,
      },
    ]);

    setDraftProduct("");
    setDraftColor("");
    setDraftLength("");
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
            quantitySold: i.quantitySold,
            rate: i.rate,
            amount: i.amount,
          })),
          amountPaid: validAmountPaid,
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
                  setDraftLength("");
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
                  setDraftLength("");
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
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="Length needed (m)"
                  value={draftLength}
                  onChange={(e) => {
                    setDraftLength(e.target.value);
                    setDraftQuantity("");
                    setDraftRate("");
                    setDraftAmount("");
                  }}
                  disabled={!draftColor}
                />
              )}

              <input
                type="number"
                min="1"
                max={availableStock || undefined}
                placeholder={isPipeProduct ? "Pieces" : "Qty"}
                value={draftQuantity}
                onChange={(e) => handleDraftQuantityChange(e.target.value)}
                disabled={isPipeProduct ? !draftLength : !draftColor}
              />

              <input
                type="number"
                min="0"
                placeholder={isPipeProduct ? "Rate per meter (optional)" : "Rate (optional)"}
                value={draftRate}
                onChange={(e) => handleDraftRateChange(e.target.value)}
                disabled={isPipeProduct ? !draftLength : !draftColor}
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

            {draftColor && (!isPipeProduct || draftLength) && (
              <div className="stock-display">
                Available Stock: {availableStock}
                {isPipeProduct ? " piece(s) at this length or longer" : ""}
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
                      <td>{item.length != null ? `${item.color} · ${item.length}m` : item.color}</td>
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
        <label>Amount Paid</label>
        <input
          type="number"
          min="0"
          placeholder="0 (leave blank if nothing paid yet)"
          value={amountPaid}
          onChange={(e) => setAmountPaid(e.target.value)}
        />
        </div>

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
