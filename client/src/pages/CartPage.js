import { useContext, useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import { CartContext } from "../context/CartContext.jsx";
import { Link, useNavigate } from "react-router-dom";
import logoImg from "../images/elroy_logo_cropped.png";
import "../styles/CartPage.css";
import api from "../api/axios.js"
import { newIdempotencyKey } from "../utils/idempotencyKey.js";



export default function CartPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const { cart, updateQuantity, removeFromCart, clearCart, updateCartItem } =
    useContext(CartContext);
  const [user, setUser] = useState({});
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);


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
  if (!isCartValid) {
    alert("Please select color for all items");
    return;
  }

  try {
    await api.post(
      "/send-enquiry",
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
          "Idempotency-Key": idempotencyKey,
        },
      }
    );

    alert("Enquiry sent successfully!");
    setIdempotencyKey(newIdempotencyKey()); // this enquiry is done; the next submit is a new one
    clearCart();
  } catch (err) {
    console.error(err);
    alert("Failed to send enquiry.");
  }
};

  const isCartValid = cart.every(
  (item) => item.color && item.color.trim() !== ""
);

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
                      updateQuantity(item.productId, parseInt(e.target.value) || 1)
                    }
                  />

                  <select
                    value={item.color}
                    onChange={(e) =>
                      updateCartItem(item.productId, {
                        color: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Color</option>
                    <option value="Gold">Gold</option>
                    <option value="Silver">Silver</option>
                    <option value="Bronze">Bronze</option>
                    <option value="Black">Black</option>
                    <option value="Dark Bronze">Dark Bronze</option>
                    <option value="Wood">Wood</option>
                    <option value="No Color">No Color</option>
                  </select>

                  <button onClick={() => removeFromCart(item.productId)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={handleEnquiry}
              className="enquiry-btn"
              disabled={!isCartValid}
            >
              Make Enquiry
            </button>

            {!isCartValid && (
              <p style={{color:"red"}} className="warning-text">
                Please select a color for all items before continuing.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
