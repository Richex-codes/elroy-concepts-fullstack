import "../styles/DashboardPage.css";
import dashboardImg from "../images/dashboard-img.png";
import { Link } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useContext } from "react";
import logoImg from "../images/elroy_logo_cropped.png";
import { CartContext } from "../context/CartContext.jsx";
import api from "../api/axios.js";

export default function DashboardPage() {
  const { cart } = useContext(CartContext);
  const { addToCart } = useContext(CartContext);
  const navigate = useNavigate();
  const [user, setUser] = useState({});
  const [isAdmin, setisAdmin] = useState(false);
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  // const [selectedCategory, setSelectedCategory] = useState("");

  const handleLogout = async () => {
    try {
      await api.post(
        "/logout",
        { reason: "manual" },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
    } catch (err) {
      console.error("Failed to record logout:", err);
    }
    localStorage.removeItem("token");
    navigate("/login");
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      return navigate("/login");
    }

    const decoded = jwtDecode(token);
    setUser(decoded);

    if (decoded.isAdmin === true) {
      setisAdmin(true);
    }
  }, [navigate]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get(
          "/admin/categories",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setCategories(response.data);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };

    fetchCategories();
  }, []);

  // fetch featured products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get(
          "/products/recent-products",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setFeaturedProducts(response.data);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      }
    };
    fetchProducts();
  }, []);

  return (
    <div className="dashboard-page">
      <header>
        <nav>
          <div className="logo-container">
            <img src={logoImg} alt="logo" className="logo-icon" />
          </div>
          <ul className="dashboard-nav-links">
            <li>
              <Link to="/home">Home</Link>
            </li>
            <li>
              <Link to="/products">Products</Link>
            </li>
            <li>
              <a href="#categories">Categories</a>
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
              {isAdmin && (
                <button
                  onClick={() => {
                    navigate("/admin");
                  }}
                  className="admin-link"
                >
                  Admin dashboard
                </button>
              )}
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
              <Link to="/home" onClick={toggleSidebar}>
                Home
              </Link>
            </li>
            <li>
              <Link to="/products" onClick={toggleSidebar}>
                Products
              </Link>
            </li>
            <li>
              <a href="#categories" onClick={toggleSidebar}>
                Categories
              </a>
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
            {isAdmin && (
              <li>
                <button
                  onClick={() => navigate("/admin")}
                  className="admin-link"
                >
                  Admin Dashboard
                </button>
              </li>
            )}
          </ul>
        </div>
      </header>
      <main>
        <section id="home" className="dashboard-section1">
          <div className="hero-content">
            <h1>Hi, {user.name}</h1>
            <h2>Elevate Your Space with Elroy Concepts.</h2>
            <p>
              Discover bespoke railings that blend safety, style, and unmatched
              craftsmanship.
            </p>
            <Link to="/products" class="cta-button" w-tid="87">
              Shop Now
            </Link>
          </div>
          <div class="hero-image-container" w-tid="89">
            <img
              src={dashboardImg}
              alt="Modern aluminium railings on a balcony"
              className="hero-image"
            />
          </div>
        </section>
        <section id="products" className="featured-products-section">
          <h2>Featured Products</h2>
          <div className="product-grid">
            {featuredProducts.map(
              (
                product // <--- Use parentheses instead of curly braces
              ) => (
                <div className="product-card" key={product._id}>
                  <img
                    src={product.image} // <--- CHANGED HERE
                    alt={product.name}
                    className="product-img"
                  />
                  <h2 className="product-name">{product.name}</h2>
                  <button
                    onClick={() =>
                      addToCart({
                        productId: product._id,
                        name: product.name,
                        quantity: 1,
                      })
                    }
                    className="add-to-cart-btn"
                  >
                    Add to Cart
                  </button>
                </div>
              )
            )}
          </div>
        </section>
        <section id="categories" className="product-categories-section">
          <h2>Product Categories</h2>
          <div className="category-grid">
            {categories.map((category) => (
              <div className="category-card" key={category._id}>
                <h3>{category.name}</h3>
                <p>{category.description}</p>
                <Link
                  className="cta-button-secondary"
                  to={`/products/category/${category._id}`}
                >
                  View Products
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="dashboard-footer">
        <div className="footer-content">
          <div className="footer-column footer-column-contact">
            <h3>Contact Us</h3>
            <p>
              Head Office: 8, Sowemimo Street, Agape Estate, Opp. Trade Fair,
              Badagry Expressway, Lagos. (07062606662)
            </p>
            <p>
              Lekki Branch: Road 4, Block B4 Shop 262/263, HFP Shopping
              Complex, Abraham Adesanya Roundabout, Lekki-Epe Expressway,
              Lagos. (07066313719, 08091487116)
            </p>
            <p>
              Dopemu Branch: 148, Dopemu Road, Dopemu, Agege, Lagos.
              (08035570086)
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Elroy Concepts. All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  );
}
