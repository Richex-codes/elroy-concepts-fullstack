import { Link } from "react-router-dom";
import "../styles/LegalPage.css";
import logoImg from "../images/elroy_logo_cropped.png";

export default function TermsOfService() {
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
          <h1>Terms of Service</h1>
          <p className="legal-updated">Last updated: July 2026</p>

          <p className="legal-intro">
            These terms govern your use of the Elroy Concepts website and account system. By creating an
            account or submitting an enquiry through this site, you agree to them.
          </p>

          <section>
            <h2>1. Who We Are</h2>
            <p>
              Elroy Concepts is a supplier of power equipment and aluminum balustrade systems, with our
              head office in Lekki Ajah and branches in Agege and Badagry, all in Lagos. This site lets
              you browse our products, create an account, and send us enquiries; our staff use a connected
              admin system to manage inventory, sales, and customer records across all branches.
            </p>
          </section>

          <section>
            <h2>2. Accounts</h2>
            <ul>
              <li>You must provide accurate information when registering, and keep your password confidential</li>
              <li>You're responsible for any activity that happens under your account</li>
              <li>Let us know immediately if you believe your account has been accessed without authorization</li>
              <li>We may suspend or terminate accounts used in violation of these terms, or to protect the security of the system</li>
            </ul>
          </section>

          <section>
            <h2>3. Product Enquiries and Sales</h2>
            <p>
              Submitting a product enquiry through this site is a request for information and pricing — it
              is not a binding order, and no payment is taken at that stage. A sale is only finalized when
              confirmed directly with our staff, whether in person, by phone, or by email.
            </p>
            <p>
              Product availability, pricing, and specifications shown on this site are provided as
              accurately as possible but are subject to change without notice, including due to stock
              levels varying by branch.
            </p>
          </section>

          <section>
            <h2>4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the site or account system for any unlawful purpose</li>
              <li>Attempt to access data, accounts, or areas of the system you're not authorized to access</li>
              <li>Interfere with or disrupt the operation of the site or its underlying systems</li>
              <li>Submit false or misleading information in an account or enquiry</li>
            </ul>
          </section>

          <section>
            <h2>5. Intellectual Property</h2>
            <p>
              The Elroy Concepts name, logo, and the content of this site (excluding product photography
              provided by manufacturers) belong to Elroy Concepts and may not be copied or used without
              permission.
            </p>
          </section>

          <section>
            <h2>6. Limitation of Liability</h2>
            <p>
              We work to keep the information on this site accurate and the system available, but we don't
              guarantee it will be error-free or uninterrupted at all times. To the extent permitted by law,
              Elroy Concepts is not liable for indirect or consequential losses arising from use of this site,
              beyond our responsibilities for the products and services we sell directly.
            </p>
          </section>

          <section>
            <h2>7. Changes to These Terms</h2>
            <p>We may update these terms from time to time. If we make material changes, we'll update the "Last updated" date above. Continued use of the site after changes means you accept the updated terms.</p>
          </section>

          <section>
            <h2>8. Governing Law</h2>
            <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>
          </section>

          <section>
            <h2>9. Contact Us</h2>
            <p>
              Questions about these terms can be sent to{" "}
              <a href="mailto:richardigwe2005@gmail.com">richardigwe2005@gmail.com</a>, or raised at any of
              our branches.
            </p>
          </section>

          <p className="legal-cross-link">
            See also our <Link to="/privacy-policy">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
