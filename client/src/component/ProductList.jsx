import React, { useEffect, useState } from "react";
import axios from "axios";
import "../styles/ProductList.css";

export default function ProductListPage() {
  const [products, setProducts] = useState([]);
  const [viewMode, setViewMode] = useState("card"); // "card" or "table"
  const [filters, setFilters] = useState({
    product: "",
    category: "",
  });

  const fetchProducts = async () => {
    try {
      const res = await axios.get("http://localhost:3001/products", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setProducts(res.data);
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  // filter products by category
  // filter products by name
  const filtered = products.filter((item) => {
    const productMatch = item.name
      .toLowerCase()
      .includes(filters.product.toLowerCase());
    const CategoryMatch = item.category?.name
      .toLowerCase()
      .includes(filters.category.toLowerCase());

    return productMatch && CategoryMatch;
  });

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this product?"))
      return;
    try {
      await axios.delete(`http://localhost:3001/products/${id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      fetchProducts();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return (
    <div className="product-list-page">
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

      <div className="inventory-filters">
        <input
          type="text"
          placeholder="Search by name..."
          value={filters.product}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, product: e.target.value }))
          }
        />
        <input
          type="text"
          placeholder="Search by category..."
          value={filters.category}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, category: e.target.value }))
          }
        />
      </div>

      {viewMode === "card" ? (
        <div className="card-grid">
          {filtered.map((product) => (
            <div className="product-card" key={product._id}>
              <img
                src={`http://localhost:3001/uploads/${product.image}`}
                alt={product.name}
                className="product-img"
              />
              <h3>{product.name}</h3>
              <p>
                <strong>Category:</strong> {product.category?.name}
              </p>
              {/* <div className="branch-quantities">
                {product.inventory.map((item) => (
                  <div key={item._id}>
                    {item.branch?.name}: {item.quantity}
                  </div>
                ))}
              </div> */}
              <div className="admin-actions">
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(product._id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product._id}>
                <td>{product.name}</td>
                <td>{product.category?.name}</td>
                {/* <td>
                  {product.inventory.map((item) => (
                    <div key={item._id}>
                      {item.branch?.name}: {item.quantity}
                    </div>
                  ))}
                </td> */}
                <td>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(product._id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
