import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import { CartContext } from "../context/CartContext";
import { Link, useNavigate } from "react-router-dom";
import logoImg from "../images/elroy_logo_cropped.png";
import "../styles/ProductPage.css";

export default function ProductPage() {
  const { cart, addToCart } = useContext(CartContext);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const handleProductClick = (product) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await axios.get(
          "https://elroy-concepts.onrender.com/products",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setProducts(res.data);
      } catch (err) {
        console.error("Error fetching products:", err);
        navigate("/login"); // If unauthorized
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [navigate]);

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="product-page">
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
        <h1>All Products</h1>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="product-search"
        />
        {modalOpen && selectedProduct && (
          <div className="product-modal">
            <div className="modal-content">
              <span className="close" onClick={() => setModalOpen(false)}>
                &times;
              </span>
              <img
                src={selectedProduct.image} // <-- CHANGED HERE
                alt={selectedProduct.name}
                className="modal-product-img"
              />
              <h2>{selectedProduct.name}</h2>
              <p>Description: {selectedProduct.description}</p>
              <button
                onClick={() =>
                  addToCart({
                    productId: selectedProduct._id,
                    name: selectedProduct.name,
                    quantity: 1,
                  })
                }
                className="add-to-cart-btn"
              >
                Add to Cart
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p>Loading products...</p>
        ) : filteredProducts.length === 0 ? (
          <p>No products found.</p>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <div key={product._id} className="product-card">
                <img
                  src={product.image} // <-- CHANGED HERE
                  alt={product.name}
                  className="product-img"
                  onClick={() => handleProductClick(product)}
                />
                <h3>{product.name}</h3>
                <p>Category: {product.category?.name}</p>
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
