import "../styles/ForgottenPass.css";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import logoImg from "../images/elroy_logo_cropped.png";

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgottenPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/forgot-password", { email });
      setMessageType("success");
      setMessage("Check your email for a link to reset your password.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error.response?.data?.msg ||
          "Failed to send reset link. Please try again."
      );
      // The server enforces the same cooldown independently -- if it just
      // rejected this as too soon, keep the button locked instead of
      // letting the user hammer it again immediately.
      if (error.response?.status === 429) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgotten-password-page">
      <header className="forgotten-password-header">
        <img src={logoImg} alt="Logo" className="logo-icon" />
      </header>
      <main className="forgotten-password-main">
        <div className="forgotten-password">
          <div className="auth-icon">
            <i className="fas fa-key"></i>
          </div>
          <h2>Forgotten Password</h2>
          <p>Enter your email and we'll send you a link to reset your password.</p>
          {message && (
            <div className={`alert alert-${messageType}`}>{message}</div>
          )}
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={loading || cooldown > 0}>
              <i className="fas fa-paper-plane"></i>{" "}
              {cooldown > 0
                ? `Resend available in ${cooldown}s`
                : loading
                ? "Sending..."
                : "Send Reset Link"}
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
