import React, { useEffect, useState } from "react";
import axios from "axios";
import "../styles/Inventory.css";

export default function InventoryPage() {
  const [inventoryData, setInventoryData] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [filters, setFilters] = useState({
    product: "",
    branch: "",
    fromDate: "",
    toDate: "",
  });

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const res = await axios.get(
          "https://elroy-concepts.onrender.com/products",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setInventoryData(res.data);
      } catch (err) {
        console.error("Failed to load inventory:", err);
      }
    };
    fetchInventory();
  }, []);

  // Flatten the inventory
  const flattenedInventory = inventoryData.flatMap((product) =>
    product.inventory.map((item) => ({
      productId: product._id,
      inventoryId: item._id,
      name: product.name,
      branchName: item.branch.name,
      branchId: item.branch._id,
      quantity: item.quantity,
      addedAt: item.addedAt,
    }))
  );

  // Apply filters
  const filtered = flattenedInventory.filter((item) => {
    const productMatch = item.name
      .toLowerCase()
      .includes(filters.product.toLowerCase());
    const branchMatch = item.branchName
      .toLowerCase()
      .includes(filters.branch.toLowerCase());

    const itemDate = new Date(item.addedAt);
    const fromDate = filters.fromDate ? new Date(filters.fromDate) : null;
    const toDate = filters.toDate
      ? new Date(new Date(filters.toDate).setHours(23, 59, 59, 999))
      : null;

    const dateMatch =
      (!fromDate || itemDate >= fromDate) && (!toDate || itemDate <= toDate);

    return productMatch && branchMatch && dateMatch;
  });

  const handleEditClick = (index) => setEditingIndex(index);

  const handleQuantityChange = (index, value) => {
    const updated = [...filtered];
    updated[index].quantity = value;
    setInventoryData((prev) =>
      prev.map((prod) => {
        if (prod._id === updated[index].productId) {
          return {
            ...prod,
            inventory: prod.inventory.map((inv) =>
              inv._id === updated[index].inventoryId
                ? { ...inv, quantity: value }
                : inv
            ),
          };
        }
        return prod;
      })
    );
  };

  const handleSaveClick = async (item, index) => {
    try {
      await axios.put(
        `https://elroy-concepts.onrender.com/products/${item.productId}/${item.inventoryId}`,
        { quantity: item.quantity },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      setEditingIndex(null);
    } catch (err) {
      console.error("Failed to update quantity:", err);
    }
  };

  return (
    <div className="inventory-page">
      <h2>Inventory by Branch</h2>

      {/* Filters */}
      <div className="inventory-filters">
        <input
          type="text"
          placeholder="Search Product..."
          value={filters.product}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, product: e.target.value }))
          }
        />
        <input
          type="text"
          placeholder="Search Branch..."
          value={filters.branch}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, branch: e.target.value }))
          }
        />
        <div className="date-filters">
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, fromDate: e.target.value }))
            }
          />
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, toDate: e.target.value }))
            }
          />
        </div>
      </div>

      <table className="inventory-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Branch</th>
            <th>Quantity</th>
            <th>Added At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item, index) => (
            <tr key={item.inventoryId}>
              <td>{item.name}</td>
              <td>{item.branchName}</td>
              <td>
                {editingIndex === index ? (
                  <input
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={(e) =>
                      handleQuantityChange(index, parseInt(e.target.value))
                    }
                  />
                ) : (
                  item.quantity
                )}
              </td>
              <td>{new Date(item.addedAt).toLocaleDateString()}</td>
              <td>
                {editingIndex === index ? (
                  <button
                    className="action-btn"
                    onClick={() => handleSaveClick(item, index)}
                  >
                    Save
                  </button>
                ) : (
                  <button
                    className="action-btn"
                    onClick={() => handleEditClick(index)}
                  >
                    Edit
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Total Summary Section */}
      <div className="inventory-summary">
        <h3>Inventory Summary by Branch</h3>
        <ul>
          {Object.entries(
            flattenedInventory.reduce((acc, item) => {
              const key = `${item.name} (${item.branchName})`;
              acc[key] = (acc[key] || 0) + item.quantity;
              return acc;
            }, {})
          ).map(([key, total]) => (
            <li key={key}>
              <strong>{key}</strong>: {total}
            </li>
          ))}
        </ul>
      </div>
      <div className="inventory-summary">
        <h3>Total Quantity per Product</h3>
        <ul>
          {Object.entries(
            flattenedInventory.reduce((acc, item) => {
              acc[item.name] = (acc[item.name] || 0) + item.quantity;
              return acc;
            }, {})
          ).map(([product, total]) => (
            <li key={product}>
              <strong>{product}</strong>: {total}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
