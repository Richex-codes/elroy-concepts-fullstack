import axios from "axios";
import { useEffect, useState, useMemo, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import logoImg from "../images/elroy_logo_cropped.png";
import { useParams } from "react-router-dom";
import "../styles/ProductCategoryPage.css";
import { CartContext } from "../context/CartContext";

export default function ProductCategoryPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const { cart } = useContext(CartContext);
  const { addToCart } = useContext(CartContext);
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const handleProductClick = (product) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };
  // get the category id from the url using useParams
  const { categoryId } = useParams();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      return navigate("/login");
    }
    setLoading(true);
    const fetchProducts = async () => {
      try {
        const response = await axios.get(
          `https://elroy-concepts.onrender.com/products/category/${categoryId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        setProducts(response.data);
        if (response.data.length > 0) {
          setCategory(response.data[0].category.name);
        }
      } catch (error) {
        // if the error is 404 or 401, redirect do dashboard
        if (
          error.response &&
          (error.response.status === 404 || error.response.status === 401)
        ) {
          navigate("/dashboard");
        } else {
          console.error("Error fetching products:", error);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [categoryId, navigate]);

  // This is where the core search logic resides
  const displayedProducts = useMemo(() => {
    // If search term is empty or just whitespace, return all products
    if (!searchTerm.trim()) {
      return products;
    }

    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    // Filter products based on the search term
    const filtered = products.filter((product) => {
      return product.name.toLowerCase().includes(lowerCaseSearchTerm);
    });

    // If no products match the search term, return all products
    if (filtered.length === 0) {
      return products;
    }

    // Otherwise, return the filtered products
    return filtered;
  }, [searchTerm, products]);

  return (
    <div className="product-category-page">
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
        <h1>{category}</h1>
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="product-search"
        />

        {modalOpen && selectedProduct && (
          <div className="product-modal">
            <div className="modal-content">
              <span className="close" onClick={() => setModalOpen(false)}>
                &times;
              </span>
              <img
                src={`https://elroy-concepts.onrender.com/uploads/${selectedProduct.image}`}
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
          <p className="loading-message">Loading products...</p>
        ) : (
          <>
            <div className="product-grid">
              {products.length > 0 ? (
                displayedProducts.map((product) => (
                  <div key={product._id} className="product-card">
                    <img
                      src={`https://elroy-concepts.onrender.com/uploads/${product.image}`}
                      alt={product.name}
                      className="product-img"
                      onClick={() => handleProductClick(product)}
                    />
                    <h3>{product.name}</h3>
                    <p>Category: {product.category.name}</p>
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
                ))
              ) : (
                <p>No products found in this category.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
