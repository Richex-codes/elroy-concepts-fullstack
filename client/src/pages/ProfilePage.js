import { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Link } from "react-router-dom";
import "../styles/ProfilePage.css";
import axios from "axios";
import logoImg from "../images/elroy_logo_cropped.png";
import { CartContext } from "../context/CartContext";

export default function ProfilePage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const { cart } = useContext(CartContext);
  const [user, setUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phoneNumber: "",
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return navigate("/login");

    const decoded = jwtDecode(token);

    setUser(decoded);
    setFormData((prev) => ({
      ...prev,
      name: decoded.name || "",
      phoneNumber: decoded.phoneNumber || "",
    }));
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const handleUpdate = async () => {
    try {
      await axios.put("https://elroy-concepts.onrender.com/profile", formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setMessage("Profile updated successfully!");
      setTimeout(() => setMessage(""), 3000);
      setEditMode(false);
    } catch (err) {
      setMessage(
        err.response?.data?.msg || "Update failed. Please check your inputs."
      );
      setTimeout(() => setMessage(""), 3000);
    }
  };

  return (
    <div className="profile-page">
      <header>
        <nav>
          <div className="logo-container">
            <img src={logoImg} alt="logo" className="logo-icon" />
          </div>
          <ul className="dashboard-nav-links">
            <li w-tid="31">
              <Link to="/dashboard">Home</Link>
            </li>
            <li>
              <Link to="/products">Products</Link>
            </li>
            <li>
              <Link to="/profile">Profile</Link>
            </li>
          </ul>
          <div className="nav-actions">
            <Link to="/cart" className="cart-link">
              <i className="fas fa-shopping-cart"></i>
              <span className="cart-item-count" id="cart-item-count">
                {cart.length}
              </span>
            </Link>
            <div className="nav-buttons">
              <button
                onClick={handleLogout}
                className="logout-link"
                id="login-register-link"
              >
                Logout
              </button>
            </div>
          </div>
          <button
            className="menu-toggle"
            onClick={toggleSidebar}
            aria-label="Toggle Menu"
          >
            <i className="fas fa-bars"></i>
          </button>
        </nav>
        <div className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
          <button className="close-sidebar" onClick={toggleSidebar}>
            &times;
          </button>

          <ul className="sidebar-links">
            <li>
              <Link to="/dashboard" onClick={toggleSidebar}>
                Home
              </Link>
            </li>
            <li>
              <Link to="/products" onClick={toggleSidebar}>
                Products
              </Link>
            </li>
            <li>
              <Link to="/profile" onClick={toggleSidebar}>
                Profile
              </Link>
            </li>
            <li>
              <Link to="/cart" onClick={toggleSidebar}>
                Cart ({cart.length})
              </Link>
            </li>
            <li>
              <button onClick={handleLogout} className="logout-link">
                Logout
              </button>
            </li>
          </ul>
        </div>
      </header>

      <main className="profile-page-container">
        <div className="profile-card">
          <h2>Your Profile</h2>
          {user && (
            <>
              {editMode ? (
                <>
                  <label>Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                  />

                  <label>Phone</label>
                  <input
                    type="text"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                  />

                  <label>Old Password</label>
                  <input
                    type="password"
                    name="oldPassword"
                    placeholder="Enter current password"
                    value={formData.oldPassword}
                    onChange={handleChange}
                  />

                  <label>New Password</label>
                  <input
                    type="password"
                    name="newPassword"
                    placeholder="Enter new password"
                    value={formData.newPassword}
                    onChange={handleChange}
                  />

                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm new password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />

                  <div className="profile-buttons">
                    <button
                      className="btn-outline"
                      onClick={() => setEditMode(false)}
                    >
                      Cancel
                    </button>
                    <button className="btn-primary" onClick={handleUpdate}>
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    <strong>Name:</strong> {user.name}
                  </p>
                  <p>
                    <strong>Email:</strong> {user.email}
                  </p>
                  <p>
                    <strong>Phone:</strong> {user.phoneNumber || "Not provided"}
                  </p>
                  <p>
                    <strong>Role:</strong> {user.isAdmin ? "Admin" : "User"}
                  </p>

                  <div className="profile-buttons">
                    <button
                      className="btn-outline"
                      onClick={() => setEditMode(true)}
                    >
                      Edit
                    </button>
                    <button className="btn-primary" onClick={handleLogout}>
                      Logout
                    </button>
                  </div>
                </>
              )}
              {message && <p className="profile-message">{message}</p>}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
