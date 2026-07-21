import { Link } from "react-router-dom";
import "../styles/SignUpPage.css";
import { useState } from "react";
import api from "../api/axios.js";
// import { useNavigate } from "react-router-dom";
import Spinner from "../component/Spinner";
import logoImg from "../images/elroy_logo_cropped.png";

export default function SignUpPage() {
  // const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
    adminRequested: false,
  });
  const [loading, setloading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setloading(true);
    try {
      await api.post("/register", formData);
      setMessageType("success");
      setMessage(
        "Registered successfully! Please check your email to verify your account."
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error.response?.data?.msg || "Something went wrong. Please try again."
      );
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setloading(false);
    }
  };

  return (
    <div className="signup-page">
      {loading && <Spinner></Spinner>}
      {!loading && (
        <>
          <header className="signup-header">
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
                  <Link to="/login" className="nav-link">
                    Login
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
            <section className="registration-section">
              <div className="registration-container">
                <div className="auth-icon">
                  <i className="fas fa-user-plus"></i>
                </div>
                <h2>Create Your Account</h2>
                {message && (
                  <div className={`alert alert-${messageType}`}>{message}</div>
                )}
                <form id="registration-form" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="full-name">Full Name</label>
                    <input
                      onChange={handleChange}
                      type="text"
                      id="full-name"
                      name="name"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      onChange={handleChange}
                      type="email"
                      id="email"
                      name="email"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone</label>
                    <input
                      onChange={handleChange}
                      type="tel"
                      id="phone"
                      name="phoneNumber"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                      onChange={handleChange}
                      type="password"
                      id="password"
                      name="password"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirm-password">Confirm Password</label>
                    <input
                      onChange={handleChange}
                      type="password"
                      id="confirm-password"
                      name="confirmPassword"
                      required
                    />
                  </div>
                  <div className="admin-request-box">
                    <label htmlFor="admin-request" className="admin-request-label">
                      <input
                        type="checkbox"
                        id="admin-request"
                        checked={formData.adminRequested}
                        onChange={(e) =>
                          setFormData({ ...formData, adminRequested: e.target.checked })
                        }
                      />
                      <span>
                        <i className="fas fa-triangle-exclamation"></i>{" "}
                        <strong>I am a business/branch admin, not a customer</strong>
                      </span>
                    </label>
                    <p className="admin-request-hint">
                      Only check this box if you manage a branch for Elroy Concepts and need
                      admin access to the inventory system. <strong>Regular shoppers should
                      leave this unchecked.</strong> Checking it does not grant access by
                      itself — a super admin still has to approve your request.
                    </p>
                  </div>
                  <div className="form-group form-group-checkbox">
                    <label htmlFor="agree-terms">
                      <input
                        type="checkbox"
                        id="agree-terms"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        required
                      />
                      I agree to the{" "}
                      <Link to="/terms-of-service" target="_blank" rel="noopener noreferrer">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer">
                        Privacy Policy
                      </Link>
                    </label>
                  </div>
                  <button type="submit" className="cta-button">
                    <i className="fas fa-user-plus"></i> Register
                  </button>
                </form>
                <p className="login-redirect">
                  Already have an account? <Link to="/login">Login here</Link>
                </p>
              </div>
            </section>
          </main>
          <footer className="registration-footer">
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
