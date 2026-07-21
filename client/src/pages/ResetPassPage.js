import { useState } from "react";
import "../styles/ResetPassPage.css";
import api from "../api/axios.js";
import { useParams, useNavigate, Link } from "react-router-dom";
import logoImg from "../images/elroy_logo_cropped.png";

export default function ResetPassPage() {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const { token } = useParams();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post(`/reset-password/${token}`, form);
      setMessageType("success");
      setMessage("Password reset successfully! Redirecting to login...");
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error.response?.data?.msg ||
          "Failed to reset password. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    <div className="reset-password-page">
      <header className="reset-password-header">
        <img src={logoImg} alt="Logo" className="logo-icon" />
      </header>
      <main className="reset-password-main">
        <div className="reset-password">
          <div className="auth-icon">
            <i className="fas fa-unlock-keyhole"></i>
          </div>
          <h2>Reset Password</h2>
          <p>Enter a new password for your account.</p>
          {message && (
            <div className={`alert alert-${messageType}`}>{message}</div>
          )}
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="Enter New Password"
              required
              minLength={8}
              value={form.newPassword}
              onChange={(e) =>
                setForm({ ...form, newPassword: e.target.value })
              }
            />
            <input
              type="password"
              placeholder="Confirm New Password"
              required
              minLength={8}
              value={form.confirmPassword}
              onChange={(e) =>
                setForm({ ...form, confirmPassword: e.target.value })
              }
            />
            <button type="submit" disabled={loading}>
              <i className="fas fa-unlock-keyhole"></i> {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
          <p className="back-to-login">
            <Link to="/login">Back to login</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
