import React from "react";
import "../styles/ErrorBanner.css";

export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div className="error-banner" role="alert">
      <i className="fas fa-triangle-exclamation"></i>
      <span>{message}</span>
      <button
        type="button"
        className="error-banner-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <i className="fas fa-xmark"></i>
      </button>
    </div>
  );
}
