import { Link } from "react-router-dom";
import "../styles/LegalPage.css";
import logoImg from "../images/elroy_logo_cropped.png";

export default function PrivacyPolicy() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/home">
          <img src={logoImg} alt="Elroy Concepts" className="logo-icon" />
        </Link>
        <Link to="/home">Back to site</Link>
      </header>

      <main className="legal-main">
        <div className="legal-content">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: July 2026</p>

          <p className="legal-intro">
            This policy explains what personal information Elroy Concepts ("we", "us")
            collects through this website and account system, why we collect it, and
            what you can do about it. It's written to reflect exactly what this system
            actually does — not a generic template.
          </p>

          <section>
            <h2>1. Information We Collect</h2>
            <p>When you create an account, we collect:</p>
            <ul>
              <li>Your name, email address, and phone number</li>
              <li>A password, which we never store in plain text — it's hashed before it ever reaches our database</li>
            </ul>
            <p>If you submit a product enquiry, we collect the name, email, phone number, and product details (quantity, color) you provide.</p>
            <p>
              If you're a customer served in person at one of our branches, our staff record your name, the
              branch, and the items and amounts of the sale in our internal sales system. We do not require
              a customer account for in-person purchases.
            </p>
          </section>

          <section>
            <h2>2. How We Use Your Information</h2>
            <ul>
              <li>To create and manage your account, and to verify your email address</li>
              <li>To let you reset your password if you forget it</li>
              <li>To respond to product enquiries and follow up with you about them</li>
              <li>To keep accurate records of sales and inventory across our branches</li>
              <li>To notify our staff internally (by email and WhatsApp) when a new enquiry comes in, so we can respond quickly</li>
            </ul>
            <p>We do not sell, rent, or trade your personal information to anyone.</p>
          </section>

          <section>
            <h2>3. How We Store and Protect Your Information</h2>
            <p>
              Your data is stored in a managed, access-controlled database. Passwords are hashed and never
              stored or transmitted in readable form. Access to customer and sales data is restricted to
              authorized staff accounts, and every sensitive administrative action (adding stock, recording
              or deleting a sale, clearing a debt) is permanently logged with who did it and when, so our
              own records stay accountable.
            </p>
            <p>
              We use your browser's local storage (not cookies) to keep you signed in. This token is only
              readable by this site and is cleared when you log out.
            </p>
          </section>

          <section>
            <h2>4. Third-Party Services We Use</h2>
            <p>To run this system, we rely on a small number of trusted service providers, each handling only what's needed for their specific job:</p>
            <ul>
              <li><strong>MongoDB Atlas</strong> — hosts our database</li>
              <li><strong>Cloudinary</strong> — hosts product images</li>
              <li><strong>Twilio</strong> — delivers WhatsApp notifications to our staff about new enquiries</li>
              <li><strong>Google (Gmail)</strong> — delivers account verification, password reset, and enquiry emails</li>
            </ul>
            <p>These providers process data on our behalf under their own security and privacy standards; we don't share your information with them for any purpose beyond operating this system.</p>
          </section>

          <section>
            <h2>5. Cookies</h2>
            <p>
              This site does not use tracking or advertising cookies, and we don't run any third-party
              analytics. The only thing kept in your browser is the login session mentioned above.
            </p>
          </section>

          <section>
            <h2>6. Your Rights</h2>
            <p>You can ask us at any time to:</p>
            <ul>
              <li>Show you what personal information we hold about you</li>
              <li>Correct any information that's inaccurate</li>
              <li>Delete your account and associated personal information, except where we're required to keep sales/financial records for legitimate business or tax purposes</li>
            </ul>
            <p>To make any of these requests, contact us using the details below.</p>
          </section>

          <section>
            <h2>7. Children's Privacy</h2>
            <p>This service is intended for adults conducting business with us and is not directed at children. We don't knowingly collect information from children.</p>
          </section>

          <section>
            <h2>8. Changes to This Policy</h2>
            <p>If we make material changes to this policy, we'll update the "Last updated" date above. Continued use of the site after changes means you accept the updated policy.</p>
          </section>

          <section>
            <h2>9. Contact Us</h2>
            <p>
              Questions about this policy or your data can be sent to{" "}
              <a href="mailto:richardigwe2005@gmail.com">richardigwe2005@gmail.com</a>, or raised at any of
              our branches.
            </p>
          </section>

          <p className="legal-cross-link">
            See also our <Link to="/terms-of-service">Terms of Service</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
