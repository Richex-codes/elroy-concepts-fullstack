import { Link } from "react-router-dom";
import "../styles/LoginPage.css";
import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../component/Spinner";
import logoImg from "../images/elroy_logo_cropped.png";

export default function LoginPage() {
  const navigate = useNavigate();
   const [menuOpen, setMenuOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setloading] = useState(false);
  const [Form, setForm] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setForm({ ...Form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setloading(true);
    try {
      const response = await axios.post("http://localhost:3001/login", Form);
      console.log("logged in succesfully", response.data);
      const { token } = response.data;
      localStorage.setItem("token", token);
      navigate("/dashboard");
    } catch (error) {
      if (error.response && error.response.status === 401) {
        setSuccessMessage("Invalid credentials");
        setTimeout(() => {
          setSuccessMessage("");
        }, 1500);
      } else {
        setSuccessMessage("An error occurred");
        setTimeout(() => {
          setSuccessMessage("");
        }, 1500);
      }
    } finally {
      setloading(false);
    }
  };
  return (
    <div className="loginpage">
      {loading && <Spinner />}
      {successMessage && !loading && (
        <div className="success-message">{successMessage}</div>
      )}
      {!successMessage && !loading && (
        <>
          <header className="login-header">
            <div className="logo-container">
              <img src={logoImg} alt="Logo" className="logo-icon" />
            </div>

            <nav className={`nav-links ${menuOpen ? "open" : ""}`}>
              <ul>
                <li>
                  <Link to="/" className="nav-link">
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
                <h2>Login</h2>
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
                      required=""
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
                      required=""
                    />
                  </div>
                  <button
                    type="submit"
                    id="login-submit-btn"
                    className="cta-button auth-button"
                  >
                    Login
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
            <div className="footer-bottom">
              <p>© 2025 Elroy Concepts. All Rights Reserved.</p>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
