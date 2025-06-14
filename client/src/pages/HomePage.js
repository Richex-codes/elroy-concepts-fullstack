import "../styles/HomePage.css";
import { Link } from "react-router-dom";
import heroImg from "../images/hero-image.png";
import logoImg from "../images/elroy_logo_cropped.png";
import { useState } from "react";

// IMPORT SWIPER
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination, Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";

//IMPORT PICTURES
import work1 from "../images/Crystal-design-1.JPG";
import work2 from "../images/Crystal-design-2.JPG";
import work3 from "../images/Crystal-design-3.JPG";
import work4 from "../images/Crystal-design-4.JPG";
import work5 from "../images/Frameless-glass-design1.JPG";
import work6 from "../images/Frameless-glass-design10.JPG";
import work7 from "../images/Frameless-glass-design11.JPG";
import work8 from "../images/Frameless-glass-design2.JPG";
import work9 from "../images/Frameless-glass-design3.JPG";
import work10 from "../images/Frameless-glass-design4.JPG";
import work11 from "../images/Frameless-glass-design5.JPG";
import work12 from "../images/Frameless-glass-design6.JPG";
import work13 from "../images/Frameless-glass-design7.JPG";
import work14 from "../images/Horizontal-design-2.JPG";
import work15 from "../images/Horizontal-design-3.JPG";
import work16 from "../images/Horizontal-design-4.JPG";
import work17 from "../images/Horizontal-design-5.JPG";
import work18 from "../images/Horizontal-design-6.JPG";
import work19 from "../images/Horizontal-design.JPG";
import work20 from "../images/Vertical-design-with-dec1.JPG";
import work21 from "../images/Vertical-design-with-dec10.JPG";
import work22 from "../images/Vertical-design-with-dec3.JPG";
import work23 from "../images/Vertical-design-with-dec4.JPG";
import work25 from "../images/Vertical-design-with-dec6.JPG";
import work26 from "../images/Vertical-design-with-dec7.JPG";
import work27 from "../images/Vertical-design-with-dec8.JPG";
import work28 from "../images/Horizontal-design-8.JPG";
import work29 from "../images/Vertical-design-with-dec9.JPG";
import work30 from "../images/Frameless-Glass-Design9.JPG";

const galleryImages = [
  work1,
  work2,
  work3,
  work4,
  work5,
  work6,
  work7,
  work8,
  work9,
  work10,
  work11,
  work12,
  work13,
  work14,
  work15,
  work16,
  work17,
  work18,
  work19,
  work20,
  work21,
  work22,
  work23,
  work25,
  work26,
  work27,
  work28,
  work29,
  work30,
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  
  return (
    <div className="homepage">
      <header className="homepage-header">
        <div className="logo-container">
          <img src={logoImg} alt="Logo" className="logo-icon" />
        </div>

        <nav className={`nav-links ${menuOpen ? "open" : ""}`}>
          <ul>
            <li>
              <Link to="/login" className="nav-link">
                Login
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
        <section id="home" className="hero-section">
          <div className="hero-content">
            <h1>Quality Railings for Stairs & Balconies</h1>
            <p>
              Transform your space with our durable and stylish railing
              solutions.
            </p>
            <Link to="/register" className="hero-button">
              <i className="fa-solid fa-arrow-right-to-bracket"></i>
              Shop Now
            </Link>
          </div>
          <div className="hero-image">
            <img src={heroImg} alt="Railing" />
          </div>
        </section>
        <section className="why-choose-us-section">
          <h2>Why Choose Us?</h2>
          <div className="d-flex justify-content-center">
            <div className="highlights-grid">
              <div className="highlight">
                <i className="fa-solid fa-shield-alt"></i>
                <h3>Quality Assurance</h3>
                <p className="my-3">
                  We ensure the highest quality in all our products.
                </p>
              </div>
              <div className="highlight">
                <i className="fa-solid fa-clock"></i>
                <h3>Timely Delivery</h3>
                <p className="my-3">
                  We respect your time and deliver on schedule.
                </p>
              </div>
              <div className="highlight">
                <i className="fa-solid fa-headset"></i>
                <h3>Customer Service</h3>
                <p className="my-3">
                  Dedicated support to help you find the perfect solution.
                </p>
              </div>
              <div className="highlight">
                <i class="fas fa-tools" w-tid="195"></i>
                <h3>Expert Craftsmanship</h3>
                <p className="my-3">
                  Years of experience in designing and installing beautiful
                  railings.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section id="our-work" className="our-work-section">
          <h2>Our Work</h2>
          <Swiper
            spaceBetween={20}
            slidesPerView={1}
            loop={true}
            autoplay={{ delay: 3000, disableOnInteraction: false }}
            pagination={{ clickable: true }}
            navigation={true}
            modules={[Autoplay, Pagination, Navigation]}
            className="work-swiper"
          >
            {galleryImages.map((img, index) => (
              <SwiperSlide key={index}>
                <img
                  src={img}
                  alt={`Project ${index + 1}`}
                  className="work-img"
                />
              </SwiperSlide>
            ))}
          </Swiper>
        </section>
        <section
          id="about-company"
          className="about-section text-center pt-5 px-4"
        >
          <h2>About Elroy Concept's</h2>
          <p
            className="w-50 mx-auto text-start
"
          >
            Welcome to Elroy Concept's, your trusted partner for high-quality
            railing solutions. We are a family-owned business with a passion for
            craftsmanship and a commitment to enhancing the safety and beauty of
            your spaces, drawing from decades of experience passed down through
            generations.
          </p>
          <p className="w-50 mx-auto text-start">
            We specialize in a wide range of railings for both stairs and
            balconies, including robust Modern Steel, timeless Classic Wooden
            Banisters, sleek Glass Panel Railings, and ornate Wrought Iron
            designs. Whether you're renovating your home, upgrading an existing
            structure, or embarking on a new construction project, we offer
            durable, stylish, and compliant railing systems tailored to your
            vision.
          </p>
          <p className="w-50 mx-auto text-start">
            Our product line extends to all necessary Railing Parts &
            Accessories, ensuring you have everything you need for complete
            customization, installation, or repair. At Elroy Concept's., our
            mission is to combine top-tier materials with expert knowledge and
            personalized service to deliver products that not only meet but
            exceed your expectations. Explore our offerings and let us help you
            find the perfect railing solution for your project!
          </p>
        </section>
      </main>
      <footer className="homepage-footer">
        <div className="footer-content" w-tid="259">
          <div className="footer-column" w-tid="261">
            <h3>Contact Us</h3>
            <p>
              <i class="fas fa-phone" w-tid="267"></i> (123) 456-7890
            </p>
            <p>
              <i class="fas fa-envelope" w-tid="271"></i> info@dadsrailings.com
            </p>
            <p>
              <i class="fas fa-map-marker-alt" w-tid="275"></i> 123 Railing St,
              Anytown, USA
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
