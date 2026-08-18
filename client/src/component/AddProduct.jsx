import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios.js";
import { isOwnBranch } from "../utils/authUser.js";
import { newIdempotencyKey } from "../utils/idempotencyKey.js";
import "../styles/AddProduct.css";

export default function AddProductPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    image: null,
    dateAdded: "",
    unitType: "piece",
    pipeShape: "",
    pipeSize: "",
    pipeThickness: "",
  });
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const isPipe = formData.unitType === "length";

  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]); // 🟡 Store branch list
  const [inventory, setInventory] = useState([]); // 🟡 Store quantity per branch
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pipe products don't fit the fixed color grid below -- lengths are
  // arbitrary, so batches are built one at a time (draft-then-add-to-list,
  // same pattern AddSales.jsx uses for sale line items).
  const [pipeBatches, setPipeBatches] = useState([]); // {branch, length, color, quantity, unitLandedCost}
  const [draftBatchBranch, setDraftBatchBranch] = useState("");
  const [draftBatchLength, setDraftBatchLength] = useState("");
  const [draftBatchColor, setDraftBatchColor] = useState("");
  const [draftBatchQuantity, setDraftBatchQuantity] = useState("");
  const [draftBatchUnitLandedCost, setDraftBatchUnitLandedCost] = useState("");

  // The color x branch grid below has one quantity per cell already --
  // asking for a cost per cell too would double the grid's width. Opening
  // stock is usually one shipment anyway, so a single cost applies to every
  // cell in this submission; per-color cost variation can be set afterward
  // via Add Inventory, which prices each restock individually.
  const [openingStockUnitLandedCost, setOpeningStockUnitLandedCost] = useState("");

  // Match against the existing catalog ignoring case, spacing, and
  // punctuation -- "50mm Pipe" and "50 mm  pipe" collide here, not just
  // exact-same-text names. Mirrors the server's normalizeProductName.js;
  // keep both in sync if this changes. This is what lets a branch admin who
  // has never seen a product at their own branch (so, from where they're
  // standing, it's brand new) get pointed at Add Inventory instead of
  // unknowingly creating a second Product document for something another
  // branch already stocks under a slightly different spelling.
  const normalizeProductName = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const duplicateMatch = products.find(
    (p) => normalizeProductName(p.name) === normalizeProductName(formData.name)
  );
  const showDuplicateWarning = formData.name.trim().length > 0 && !!duplicateMatch;

  const COLORS = [
  "Gold",
  "Silver",
  "Bronze",
  "Black",
  "White",
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

    // Load the existing catalog so the name field can catch a duplicate
    // before the admin fills out (and submits) the rest of this form.
    const fetchProducts = async () => {
      try {
        const res = await api.get("/products", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        setProducts(res.data);
      } catch (err) {
        console.error("Error fetching products:", err);
      }
    };

    fetchCategories();
    fetchBranches();
    fetchProducts();
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

  const handleAddPipeBatch = () => {
    const length = Number(draftBatchLength);
    const quantity = parseInt(draftBatchQuantity, 10);

    if (!draftBatchBranch || !length || length <= 0) {
      setIsError(true);
      setMessage("Select a branch and enter a valid length.");
      return;
    }
    if (!draftBatchColor) {
      setIsError(true);
      setMessage("Select a color.");
      return;
    }
    if (!quantity || quantity <= 0) {
      setIsError(true);
      setMessage("Enter a valid number of sticks.");
      return;
    }

    setIsError(false);
    setMessage("");
    setPipeBatches((prev) => [
      ...prev,
      {
        branch: draftBatchBranch,
        length,
        color: draftBatchColor,
        quantity,
        unitLandedCost: draftBatchUnitLandedCost !== "" ? Number(draftBatchUnitLandedCost) : undefined,
      },
    ]);
    setDraftBatchLength("");
    setDraftBatchColor("");
    setDraftBatchQuantity("");
    setDraftBatchUnitLandedCost("");
  };

  const handleRemovePipeBatch = (index) => {
    setPipeBatches((prev) => prev.filter((_, i) => i !== index));
  };

  // 🔵 Submit everything including inventory
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    let inventoryPayload;

    if (isPipe) {
      if (pipeBatches.length === 0) {
        setIsError(true);
        setMessage("Add at least one length batch.");
        setLoading(false);
        return;
      }
      inventoryPayload = pipeBatches.map((batch) => ({
        branch: batch.branch,
        length: batch.length,
        color: batch.color,
        quantity: batch.quantity,
        description: formData.description,
        ...(batch.unitLandedCost != null && { unitLandedCost: batch.unitLandedCost }),
      }));
    } else {
      inventoryPayload = inventory
        .filter((item) => item.quantity > 0)
        .map((item) => ({
          ...item,
          description: formData.description, // ✅ SAME DESC FOR ALL
          ...(openingStockUnitLandedCost !== "" && {
            unitLandedCost: Number(openingStockUnitLandedCost),
          }),
        }));

      if (inventoryPayload.length === 0) {
        setIsError(true);
        setMessage("Please set quantity for at least one branch.");
        setLoading(false);
        return;
      }
    }
    // 🟡 Prepare form data with inventory
    const payload = new FormData();
    payload.append("name", formData.name);
    payload.append("category", formData.category);
    if (formData.image) {
    payload.append("image", formData.image);
    }
    payload.append("dateAdded", formData.dateAdded);
    payload.append("unitType", formData.unitType);
    if (isPipe) {
      payload.append("pipeShape", formData.pipeShape);
      payload.append("pipeSize", formData.pipeSize);
      if (formData.pipeThickness) payload.append("pipeThickness", formData.pipeThickness);
    }
    payload.append("inventory", JSON.stringify(inventoryPayload)); // send inventory

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
      setFormData({
        name: "",
        description: "",
        category: "",
        image: null,
        dateAdded: "",
        unitType: "piece",
        pipeShape: "",
        pipeSize: "",
        pipeThickness: "",
      });
      setPipeBatches([]);
      setOpeningStockUnitLandedCost("");
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
      // A 409 here means the name-check above raced with someone else
      // creating the same product between page load and submit -- the
      // server's message already tells them to use Add Inventory instead.
      setMessage(err.response?.data?.msg || "Failed to add product.");
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

          {!showDuplicateWarning && (
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
          )}
        </div>

        {!showDuplicateWarning && (
          <div className="product-form-row">
            <div className="product-form-field">
              <label>Product Type</label>
              <select name="unitType" value={formData.unitType} onChange={handleChange}>
                <option value="piece">Piece (counted normally)</option>
                <option value="length">Pipe (sold by length)</option>
              </select>
            </div>

            {isPipe && (
              <>
                <div className="product-form-field">
                  <label>Shape</label>
                  <input
                    type="text"
                    name="pipeShape"
                    list="pipe-shape-options"
                    placeholder="e.g. Round, Square"
                    value={formData.pipeShape}
                    onChange={handleChange}
                  />
                  <datalist id="pipe-shape-options">
                    <option value="Round" />
                    <option value="Square" />
                  </datalist>
                </div>
                <div className="product-form-field">
                  <label>Size</label>
                  <input
                    type="text"
                    name="pipeSize"
                    placeholder="e.g. 50mm or 50x25mm"
                    value={formData.pipeSize}
                    onChange={handleChange}
                  />
                </div>
                <div className="product-form-field">
                  <label>Thickness (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    name="pipeThickness"
                    placeholder="e.g. 1.5"
                    value={formData.pipeThickness}
                    onChange={handleChange}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {showDuplicateWarning && (
          <div className="alert alert-error">
            "{duplicateMatch.name}" already exists in the catalog. Add inventory to it instead
            of creating a new product.
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 10 }}
              onClick={() => navigate(`/admin/add-inventory?product=${duplicateMatch._id}`)}
            >
              <i className="fas fa-dolly"></i> Go to Add Inventory
            </button>
          </div>
        )}

        {!showDuplicateWarning && (
          <>
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
                <label htmlFor="product-image-input">Product Image</label>
                {/* The native file input's own "Choose File" control is
                    drawn by the OS/browser and doesn't reliably respect CSS
                    width the way text inputs do -- rendering varies enough
                    across browsers (this is the same class of thing as the
                    iOS date-input appearance bug) that on a genuinely narrow
                    screen it can still overflow even though the box itself
                    is correctly sized. Hiding it (not display:none, which
                    breaks label-click/keyboard access in some browsers) and
                    driving it entirely through this label + our own
                    filename text sidesteps that rendering difference
                    completely, on every device. */}
                <input
                  id="product-image-input"
                  type="file"
                  name="image"
                  accept="image/*"
                  onChange={handleChange}
                  className="visually-hidden-file-input"
                />
                <label htmlFor="product-image-input" className="file-input-button">
                  <i className="fas fa-upload"></i> Choose File
                  <span className="file-input-name">
                    {formData.image ? formData.image.name : "No file chosen"}
                  </span>
                </label>
              </div>
            </div>

            {!isPipe && (
              <>
            <h4>Set Quantity Per Branch</h4>

            <div className="product-form-field">
              <label>Unit Landed Cost (₦, optional — applies to all opening stock above)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 4500"
                value={openingStockUnitLandedCost}
                onChange={(e) => setOpeningStockUnitLandedCost(e.target.value)}
              />
            </div>
            <p className="product-form-section-hint">
              Leave blank if you don't know it yet. Opening stock will be marked as an
              estimated cost. If different colors/branches cost different amounts, leave this
              blank and set costs per line afterward via Add Inventory.
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
              </>
            )}

            {isPipe && (
              <>
                <h4>Add Length Batches</h4>

                <div className="pipe-batch-draft">
                  <select
                    value={draftBatchBranch}
                    onChange={(e) => setDraftBatchBranch(e.target.value)}
                  >
                    <option value="">Select Branch</option>
                    {branches.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="Length (m)"
                    value={draftBatchLength}
                    onChange={(e) => setDraftBatchLength(e.target.value)}
                  />

                  <select
                    value={draftBatchColor}
                    onChange={(e) => setDraftBatchColor(e.target.value)}
                  >
                    <option value="">Select Color</option>
                    {COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    placeholder="Sticks"
                    value={draftBatchQuantity}
                    onChange={(e) => setDraftBatchQuantity(e.target.value)}
                  />

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Cost per stick (₦, optional)"
                    value={draftBatchUnitLandedCost}
                    onChange={(e) => setDraftBatchUnitLandedCost(e.target.value)}
                  />

                  <button type="button" className="btn-add-batch" onClick={handleAddPipeBatch}>
                    + Add Batch
                  </button>
                </div>

                {pipeBatches.length > 0 && (
                  <table className="pipe-batches-table">
                    <thead>
                      <tr>
                        <th>Branch</th>
                        <th>Length</th>
                        <th>Color</th>
                        <th>Sticks</th>
                        <th>Cost</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipeBatches.map((batch, index) => (
                        <tr key={index}>
                          <td>{branches.find((b) => b._id === batch.branch)?.name || batch.branch}</td>
                          <td>{batch.length}m</td>
                          <td>{batch.color}</td>
                          <td>{batch.quantity}</td>
                          <td>{batch.unitLandedCost != null ? `₦${batch.unitLandedCost}` : "-"}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-remove-batch"
                              onClick={() => handleRemovePipeBatch(index)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              <i className="fas fa-box-open"></i> {loading ? "Adding Product..." : "Add Product"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
