import { Link } from "react-router-dom";
import "../styles/LoginPage.css";
import api from "../api/axios.js";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import Spinner from "../component/Spinner";
import logoImg from "../images/elroy_logo_cropped.png";

const RESEND_COOLDOWN_SECONDS = 60;

export default function LoginPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [loading, setloading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [Form, setForm] = useState({
    email: "",
    password: "",
  });
  const messageClearTimer = useRef(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleChange = (e) => {
    setForm({ ...Form, [e.target.name]: e.target.value });
    setNeedsVerification(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setloading(true);
    setNeedsVerification(false);
    clearTimeout(messageClearTimer.current);
    try {
      const response = await api.post(
        "/login",
        Form
      );
      const { token } = response.data;
      localStorage.setItem("token", token);
      const decoded = jwtDecode(token);
      setMessageType("success");
      setMessage("Login successful! Redirecting...");
      setRedirecting(true);
      setTimeout(() => {
        navigate(decoded.isAdmin ? "/admin" : "/dashboard");
      }, 3000);
    } catch (error) {
      setMessageType("error");
      // The server sends a specific, useful message on every rejected
      // login -- wrong credentials (401), unverified (401), pending admin
      // request (403), storefront-not-live (403) -- so show whatever it
      // sent rather than only trusting one status code and discarding the
      // rest behind a generic fallback.
      const msg = error.response?.data?.msg;
      if (msg) {
        setMessage(msg);
        if (msg === "Please verify your email") {
          // Keep this one visible with its Resend action instead of
          // auto-clearing after 3s -- the user needs time to act on it,
          // not just read it.
          setNeedsVerification(true);
        } else {
          messageClearTimer.current = setTimeout(() => setMessage(""), 3000);
        }
      } else {
        setMessage("An error occurred. Please try again.");
        messageClearTimer.current = setTimeout(() => setMessage(""), 3000);
      }
    } finally {
      setloading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      const res = await api.post("/resend-verification", { email: Form.email });
      setMessageType("success");
      setMessage(res.data?.msg || "Verification email sent. Please check your inbox (and spam folder).");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setMessageType("error");
      setMessage(error.response?.data?.msg || "Failed to resend verification email.");
      // The server enforces the same cooldown independently -- if it just
      // rejected this as too soon, keep the button locked rather than
      // letting the user hammer it again immediately.
      if (error.response?.status === 429) {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setResendLoading(false);
    }
  };
  return (
    <div className="loginpage">
      {loading && <Spinner />}
      {!loading && (
        <>
          <header className="login-header">
            <div className="logo-container">
              <img src={logoImg} alt="Logo" className="logo-icon" />
            </div>

            <nav className={`nav-links ${menuOpen ? "open" : ""}`}>
              <ul>
                <li>
                  <Link to="/home" className="nav-link">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="nav-link">
                    Register
                  </Link>
                </li>
              </ul>
            </nav>

            {/* Hamburger Menu Button */}
            <button
              className="menu-toggle"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle Menu"
            >
              <i className={`fas ${menuOpen ? "fa-times" : "fa-bars"}`}></i>
            </button>
          </header>
          <main>
            <section id="login-register-section" className="auth-page">
              <div className="auth-container">
                <div className="auth-icon">
                  <i className="fas fa-lock"></i>
                </div>
                <h2>Login</h2>
                {message && (
                  <div className={`alert alert-${messageType}`}>{message}</div>
                )}
                {needsVerification && (
                  <button
                    type="button"
                    className="resend-verification-btn"
                    onClick={handleResendVerification}
                    disabled={resendLoading || resendCooldown > 0}
                  >
                    <i className="fas fa-paper-plane"></i>{" "}
                    {resendCooldown > 0
                      ? `Resend available in ${resendCooldown}s`
                      : resendLoading
                      ? "Sending..."
                      : "Resend verification email"}
                  </button>
                )}
                <form onSubmit={handleSubmit} id="login-form">
                  <div className="form-group">
                    <label htmlFor="login-email">Email</label>
                    <input
                      value={Form.email}
                      onChange={handleChange}
                      type="email"
                      id="login-email"
                      name="email"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="login-password">Password</label>
                    <input
                      value={Form.password}
                      onChange={handleChange}
                      type="password"
                      id="login-password"
                      name="password"
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    id="login-submit-btn"
                    className="cta-button auth-button"
                    disabled={redirecting}
                  >
                    <i className="fas fa-arrow-right-to-bracket"></i>{" "}
                    {redirecting ? "Redirecting..." : "Login"}
                  </button>
                </form>
                <p className="auth-switch">
                  Don't have an account?{" "}
                  <Link to="/register" id="go-to-signup-link">
                    Sign Up
                  </Link>
                </p>
                <p className="auth-switch">
                  Forgotten Password?{" "}
                  <Link to="/forgot-password" id="go-to-signup-link">
                    Reset it here
                  </Link>
                </p>
              </div>
            </section>
          </main>
          <footer className="login-footer">
            <div className="footer-links">
              <Link to="/privacy-policy">Privacy Policy</Link>
              <span>·</span>
              <Link to="/terms-of-service">Terms of Service</Link>
            </div>
            <div className="footer-bottom">
              <p>© {new Date().getFullYear()} Elroy Concepts. All Rights Reserved.</p>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
