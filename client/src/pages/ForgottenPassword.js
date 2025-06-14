import "../styles/ForgottenPass.css";
import { useState } from "react";
import axios from "axios";

export default function ForgottenPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); // Clear previous errors
    try {
      await axios.post("http://localhost:3001/forgot-password", { email });
      // Optionally show a success message here
    } catch (error) {
      if (
        error.response &&
        error.response.data &&
        error.response.data.message
      ) {
        setError(error.response.data.message);
      } else {
        setError("Failed to reset password. Please try again.");
      }
    } finally {
      setTimeout(() => {
        setError("");
      }, 3000);
    }
  };

  return (
    <div className="forgotten-password">
      <h2>Forgotten Password</h2>
      <p>Please enter your email address to reset your password.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit">Reset Password</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
