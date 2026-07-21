import React, { useState } from "react";
import api from "../api/axios.js";
import { newIdempotencyKey } from "../utils/idempotencyKey.js";
import "../styles/Category.css";

export default function AddCategoryPage() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(
        "/admin/categories",
        { name },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Idempotency-Key": idempotencyKey,
          },
        }
      );
      setIsError(false);
      setMessage("Category added successfully!");
      setIdempotencyKey(newIdempotencyKey()); // this category is done; the next submit is a new one
      setName("");
    } catch (err) {
      setIsError(true);
      setMessage(err.response?.data?.msg || "Error creating category");
    }
  };

  return (
    <div className="add-category-page">
      <div className="add-category-icon">
        <i className="fas fa-layer-group"></i>
      </div>
      <h2>Add Category</h2>
      <p className="add-category-subtitle">
        Categories group products in the catalog and filters — a quick, one-off action.
      </p>

      {message && (
        <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="add-category-form">
        <label htmlFor="category-name">Category name</label>
        <input
          id="category-name"
          type="text"
          placeholder="e.g. Sliding Windows"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit">
          <i className="fas fa-plus"></i> Add Category
        </button>
      </form>
    </div>
  );
}
