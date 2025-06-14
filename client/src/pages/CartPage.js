import { useContext, useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import { CartContext } from "../context/CartContext.jsx";
import { Link, useNavigate } from "react-router-dom";
import logoImg from "../images/elroy_logo_cropped.png";
import axios from "axios";
import "../styles/CartPage.css";
export default function CartPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const { cart, updateQuantity, removeFromCart, clearCart } =
    useContext(CartContext);
  const [user, setUser] = useState({});

  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  // Function to handle sending enquiry
  useEffect(() => {
    const token = localStorage.getItem("token");
    const decoded = jwtDecode(token);
    setUser(decoded);
  }, []);

  const handleEnquiry = async () => {
    try {
      await axios.post(
        "https://elroy-concepts.onrender.com/send-enquiry",
        {
          cart,
          user: {
            name: user.name,
            email: user.email,
            phone: user.phoneNumber,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      alert("Enquiry sent successfully!");
      clearCart(); // Clear cart globally
    } catch (err) {
      console.error(err);
      alert("Failed to send enquiry.");
    }
  };

  return (
    <div className="cart-page">
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

      <main>
        <h2>Your Cart</h2>
        {cart.length === 0 ? (
          <p>Your cart is empty.</p>
        ) : (
          <>
            <ul className="cart-list">
              {cart.map((item) => (
                <li key={item.productId} className="cart-item">
                  <span>{item.name}</span>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateQuantity(item.productId, parseInt(e.target.value))
                    }
                  />

                  <button onClick={() => removeFromCart(item.productId)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={handleEnquiry} className="enquiry-btn">
              Make Enquiry
            </button>
          </>
        )}
      </main>
    </div>
  );
}
