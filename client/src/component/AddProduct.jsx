import React, { useState, useEffect } from "react";
import axios from "axios";
import "../styles/AddProduct.css";

export default function AddProductPage() {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    image: null,
  });

  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]); // 🟡 Store branch list
  const [inventory, setInventory] = useState([]); // 🟡 Store quantity per branch
  const [message, setMessage] = useState("");

  useEffect(() => {
    // 🔵 Load categories
    const fetchCategories = async () => {
      try {
        const res = await axios.get(
          "https://elroy-concepts.onrender.com/admin/categories"
        );
        setCategories(res.data);
      } catch (err) {
        console.error("Error fetching categories:", err);
      }
    };

    // 🔵 Load branches
    const fetchBranches = async () => {
      try {
        const res = await axios.get(
          "https://elroy-concepts.onrender.com/admin/branches",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setBranches(res.data);
        // ⚠️ Initialize inventory with all branches and quantity 0
        const initialInventory = res.data.map((branch) => ({
          branch: branch._id,
          quantity: 0,
        }));
        setInventory(initialInventory);
      } catch (err) {
        console.error("Error fetching branches:", err);
      }
    };

    fetchCategories();
    fetchBranches();
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
  const handleInventoryChange = (branchId, value) => {
    const updated = inventory.map((item) =>
      item.branch === branchId
        ? { ...item, quantity: parseInt(value) || 0 }
        : item
    );
    setInventory(updated);
  };

  // 🔵 Submit everything including inventory
  const handleSubmit = async (e) => {
    e.preventDefault();

    const filteredInventory = inventory.filter((item) => item.quantity > 0);

    if (filteredInventory.length === 0) {
      setMessage("Please set quantity for at least one branch.");
      return;
    }
    // 🟡 Prepare form data with inventory
    const payload = new FormData();
    payload.append("name", formData.name);
    payload.append("description", formData.description);
    payload.append("category", formData.category);
    payload.append("image", formData.image);
    payload.append("inventory", JSON.stringify(filteredInventory)); // send inventory

    try {
      await axios.post("https://elroy-concepts.onrender.com/products", payload, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setMessage("Product added successfully!");
      setFormData({ name: "", description: "", category: "", image: null });
      setInventory(branches.map((b) => ({ branch: b._id, quantity: 0 })));
    } catch (err) {
      console.error("Error adding product:", err);
      setMessage("Failed to add product.");
    }
  };

  return (
    <div className="add-product-page">
      <h2>Add New Product</h2>
      {message && <p className="message">{message}</p>}
      <form onSubmit={handleSubmit} className="product-form">
        <label>Product Name</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
        />
        <label>Description</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          required
        />

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

        <label>Product Image</label>
        <input
          type="file"
          name="image"
          accept="image/*"
          onChange={handleChange}
          required
        />

        <h4>Set Quantity Per Branch</h4>
        {branches.map((branch) => (
          <div className="branch-inventory" key={branch._id}>
            <label>{branch.name}</label>
            <input
              type="number"
              min="0"
              value={
                inventory.find((i) => i.branch === branch._id)?.quantity || ""
              }
              onChange={(e) =>
                handleInventoryChange(branch._id, e.target.value)
              }
            />
          </div>
        ))}

        <button type="submit" className="btn-primary">
          Add Product
        </button>
      </form>
    </div>
  );
}
