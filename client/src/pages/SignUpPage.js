import { Link } from "react-router-dom";
import "../styles/SignUpPage.css";
import { useState } from "react";
import axios from "axios";
// import { useNavigate } from "react-router-dom";
import Spinner from "../component/Spinner";
import logoImg from "../images/elroy_logo_cropped.png";

export default function SignUpPage() {
  // const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setloading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setloading(true);
    try {
      const response = await axios.post(
        "https://elroy-concepts.onrender.com/register",
        formData
      );
      console.log("user registered succesfully", response.data);
      setSuccessMessage(
        "user registered succesfully please check Your email to verify your Account!"
      );
    } catch (error) {
      if (error.response && error.response.status === 400) {
        setSuccessMessage(error.response.data.msg);
        setTimeout(() => {
          setSuccessMessage("");
        }, 1500);
      }
      if (error.response && error.response.status === 401) {
        setSuccessMessage(error.response.data.msg);
        setTimeout(() => {
          setSuccessMessage("");
        }, 1500);
      }
    } finally {
      setloading(false);
    }
  };

  return (
    <div className="signup-page">
      {loading && <Spinner></Spinner>}
      {successMessage && !loading && (
        <div className="success-message">{successMessage}</div>
      )}
      {!successMessage && !loading && (
        <>
          <header className="signup-header">
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
                <h2>Create Your Account</h2>
                <form id="registration-form" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label for="full-name">Full Name</label>
                    <input
                      onChange={handleChange}
                      type="text"
                      id="full-name"
                      name="name"
                      required=""
                    />
                  </div>
                  <div className="form-group">
                    <label for="email">Email</label>
                    <input
                      onChange={handleChange}
                      type="email"
                      id="email"
                      name="email"
                      required=""
                    />
                  </div>
                  <div className="form-group">
                    <label for="phone">Phone</label>
                    <input
                      onChange={handleChange}
                      type="tel"
                      id="phone"
                      name="phoneNumber"
                    />
                  </div>
                  <div className="form-group">
                    <label for="password">Password</label>
                    <input
                      onChange={handleChange}
                      type="password"
                      id="password"
                      name="password"
                      required=""
                    />
                  </div>
                  <div className="form-group">
                    <label for="confirm-password">Confirm Password</label>
                    <input
                      onChange={handleChange}
                      type="password"
                      id="confirm-password"
                      name="confirmPassword"
                      required=""
                    />
                  </div>
                  <button type="submit" className="cta-button">
                    Register
                  </button>
                </form>
                <p className="login-redirect">
                  Already have an account? <Link to="/login">Login here</Link>
                </p>
              </div>
            </section>
          </main>
          <footer className="registration-footer">
            <div class="footer-bottom">
              <p>© 2025 Elroy Concepts. All Rights Reserved.</p>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
