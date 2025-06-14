import { useState } from "react";
import "../styles/ResetPassPage.css";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";

export default function ResetPassPage() {
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const { token } = useParams();
  const navigate = useNavigate();

  // handle submit

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `https://elroy-concepts.onrender.com/reset-password/${token}`,
        form
      );
      // Optionally, you can add a success message or redirect here
      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (error) {
      if (
        error.response &&
        error.response.data &&
        error.response.data.msg // 👈 Fix here
      ) {
        setError(error.response.data.msg);
      } else {
        setError("Failed to reset password. Please try again.");
      }
    } finally {
      setTimeout(() => {
        setError("");
      }, 2000);
    }
  };

  return (
    <div className="reset-password">
      <h2>Reset Password</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Enter New Password"
          required
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
        />
        <input
          type="password"
          placeholder="Confirm New Password"
          required
          value={form.confirmPassword}
          onChange={(e) =>
            setForm({ ...form, confirmPassword: e.target.value })
          }
        />
        <button type="submit">Reset Password</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
