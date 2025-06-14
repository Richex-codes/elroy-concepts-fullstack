import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import "../styles/VerifyEmailPage.css";

export default function VerifyEmailPage() {
  const { token } = useParams();
  const [message, setMessage] = useState("Verifying email...");
  const navigate = useNavigate();
  const didVerify = useRef(false);

  useEffect(() => {
    if (didVerify.current) return; // skip if already verified once
    didVerify.current = true;

    const verifyEmail = async () => {
      if (!token) {
        setMessage("Invalid verification link.");
        return;
      }
      try {
        console.log("Sending verify request with token:", token);
        const response = await axios.get(
          `https://elroy-concepts.onrender.com/verify-email/${token}`
        );
        console.log("Response from verify-email:", response.data);
        setMessage(response.data.msg || "Email verified successfully!");
        if (
          response.data.msg === "Email verified successfully" ||
          response.data.msg === "Email already verified"
        ) {
          setTimeout(() => {
            navigate("/login");
          }, 3000);
        }
      } catch (error) {
        console.error("Error verifying email:", error.response?.data);
        setMessage(
          error.response?.data?.msg ||
            "Verification failed or link has expired."
        );
      }
    };
    verifyEmail();
  }, [token, navigate]);

  return (
    <div
      className="verify-email-container"
      style={{ textAlign: "center", padding: "2rem" }}
    >
      <h2>{message}</h2>
    </div>
  );
}
