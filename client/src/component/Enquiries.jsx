import React, { useEffect, useState } from "react";
import axios from "axios";
import "../styles/Enquiries.css";

export default function Enquiries() {
  const [enquiries, setEnquiries] = useState([]);

  useEffect(() => {
    fetchEnquiries();
  }, []);

  const fetchEnquiries = async () => {
    try {
      const res = await axios.get("http://localhost:3001/admin/enquiries", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setEnquiries(res.data);
    } catch (err) {
      console.error("Failed to fetch enquiries:", err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this enquiry?"))
      return;

    try {
      await axios.delete(`http://localhost:3001/admin/enquiries/${id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setEnquiries((prev) => prev.filter((enquiry) => enquiry._id !== id));
    } catch (err) {
      console.error("Failed to delete enquiry:", err);
      alert("Failed to delete. Please try again.");
    }
  };

  return (
    <div className="enquiries-page">
      <h2>Customer Enquiries</h2>
      {enquiries.length === 0 ? (
        <p>No enquiries yet.</p>
      ) : (
        <table className="enquiries-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Cart Items</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((enquiry) => (
              <tr key={enquiry._id}>
                <td data-label="Name">{enquiry.name}</td>
                <td data-label="Email">{enquiry.email}</td>
                <td data-label="Cart Items">
                  {enquiry.cart && enquiry.cart.length > 0 ? (
                    <ul>
                      {enquiry.cart.map((item, index) => (
                        <li key={index}>
                          {item.name} : {item.quantity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <em>No products in cart</em>
                  )}
                </td>
                <td data-label="Date">
                  {new Date(enquiry.createdAt).toLocaleDateString()}
                </td>
                <td data-label="Action">
                  <button
                    className="delete-button"
                    onClick={() => handleDelete(enquiry._id)}
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
