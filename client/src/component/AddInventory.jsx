import React, { useEffect, useState } from "react";
import axios from "axios";
import "../styles/addInventory.css";

export default function AddInventoryPage() {
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const productRes = await axios.get(
          "https://elroy-concepts.onrender.com/products",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setProducts(productRes.data);

        const branchRes = await axios.get(
          "https://elroy-concepts.onrender.com/admin/branches",
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
    try {
      await axios.post(
        `https://elroy-concepts.onrender.com/products/${selectedProduct}/add-inventory`,
        { branch: selectedBranch, quantity },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      setMessage("Inventory added!");
      setQuantity("");
    } catch (err) {
      console.error("Error adding inventory:", err);
      setMessage("Failed to add inventory");
    }
  };

  return (
    <div className="add-inventory-page">
      <h2>Add Inventory to Existing Product</h2>
      {message && <p>{message}</p>}

      <form className="inventory-form" onSubmit={handleSubmit}>
        <label>Select Product</label>
        <select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          required
        >
          <option value="">Select</option>
          {products.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>

        <label>Select Branch</label>
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          required
        >
          <option value="">Select</option>
          {branches.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </select>

        <label>Quantity</label>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />

        <button className="btn-primary" type="submit">
          Add Inventory
        </button>
      </form>
    </div>
  );
}
