import "../styles/DashboardPage.css";
import dashboardImg from "../images/dashboard-img.png";
import { Link } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useContext } from "react";
import logoImg from "../images/elroy_logo_cropped.png";
import { CartContext } from "../context/CartContext.jsx";
import axios from "axios";

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

  const handleLogout = () => {
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
        const response = await fetch(
          "https://elroy-concepts.onrender.com/admin/categories"
        );
        const data = await response.json();
        setCategories(data);
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
        const response = await axios.get(
          "https://elroy-concepts.onrender.com/products/recent",
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
            <li w-tid="31">
              <Link to="/">Home</Link>
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
                    navigate("/admin-dashboard");
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
              <Link to="/" onClick={toggleSidebar}>
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
                  onClick={() => navigate("/admin-dashboard")}
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
        <div className="footer-content" w-tid="259">
          <div className="footer-column" w-tid="261">
            <h3>Contact Us</h3>
            <p>
              Head Office: Shop 262/263 Block B4 HFP Shopping Complex, Abraham
              Adesanya Roundabout Lekki Ajah. (07066313719)
            </p>
            <p>Branch: No 148 dopemu road Agege Lagos. (08035570086)</p>
            <p>
              Branch: No 8 sowemimo Street Agape community badagry expressway
              Lagos. Opposite tradefair complex. (07062606662)
            </p>
          </div>
          <div class="footer-column">
            <h3>Quick Links</h3>
            <ul>
              <li>
                <a href="#home">Home</a>
              </li>
              <li>
                <a href="#about-company">About Us</a>
              </li>
              <li>
                <a href="#contact">FAQ</a>
              </li>
            </ul>
          </div>
          <div class="footer-column">
            <h3 w-tid="301">Follow Us</h3>
            <div class="social-links" w-tid="303">
              <a href="#" w-tid="305">
                <i class="fab fa-facebook-f" w-tid="307"></i>
              </a>
              <a href="#" w-tid="309">
                <i class="fab fa-instagram" w-tid="311"></i>
              </a>
              <a href="#" w-tid="313">
                <i class="fab fa-pinterest-p" w-tid="315"></i>
              </a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>© 2025 Elroy Concepts. All Rights Reserved.</p>
          <p>
            <a href="#terms">Terms &amp; Conditions</a> |{" "}
            <a href="#privacy">Privacy Policy</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
