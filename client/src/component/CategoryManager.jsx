import React, { useState } from "react";
import axios from "axios";
import "../styles/Category.css";

export default function AddCategoryPage() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(
        "https://elroy-concepts.onrender.com/admin/categories",
        { name },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      setMessage("Category added successfully!");
      setName("");
    } catch (err) {
      setMessage(err.response?.data?.msg || "Error creating category");
    }
  };

  return (
    <div className="add-category-page">
      <h2>Add Category</h2>
      {message && <p className="category-message">{message}</p>}
      <form onSubmit={handleSubmit} className="add-category-form">
        <input
          type="text"
          placeholder="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit">Add Category</button>
      </form>
    </div>
  );
}
