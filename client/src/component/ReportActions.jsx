import React, { useState } from "react";
import api from "../api/axios.js";
import "../styles/ReportActions.css";

/**
 * Shared Email / Save PDF / Print controls for any generated report
 * (inventory summary, sales invoice, etc).
 *
 * pdfEndpoint: GET route returning the PDF bytes (application/pdf)
 * emailEndpoint: POST route accepting { to, ...extraParams } to email the PDF
 * extraParams: extra filters/body sent alongside the request (e.g. branch/color filters)
 * fileName: base filename used when saving the PDF
 */
export default function ReportActions({
  pdfEndpoint,
  emailEndpoint,
  extraParams = {},
  fileName = "Report",
}) {
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const authHeaders = {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  };

  const fetchPdfBlobUrl = async () => {
    const res = await api.get(pdfEndpoint, {
      ...authHeaders,
      params: extraParams,
      responseType: "blob",
    });
    const blob = new Blob([res.data], { type: "application/pdf" });
    return window.URL.createObjectURL(blob);
  };

  const handleSave = async () => {
    setBusy(true);
    setMessage("");
    try {
      const url = await fetchPdfBlobUrl();
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setMessage("Failed to download PDF.");
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    setBusy(true);
    setMessage("");
    try {
      const url = await fetchPdfBlobUrl();
      window.open(url, "_blank");
    } catch (err) {
      console.error(err);
      setMessage("Failed to open PDF.");
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSend = async () => {
    if (!email) {
      setMessage("Enter an email address.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.post(emailEndpoint, { to: email, ...extraParams }, authHeaders);
      setMessage("Sent successfully!");
      setShowEmailInput(false);
      setEmail("");
    } catch (err) {
      console.error(err);
      setMessage("Failed to send email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-actions">
      <div className="report-actions-buttons">
        <button
          type="button"
          className="report-btn report-btn-email"
          onClick={() => setShowEmailInput((v) => !v)}
          disabled={busy}
        >
          Email
        </button>
        <button
          type="button"
          className="report-btn report-btn-save"
          onClick={handleSave}
          disabled={busy}
        >
          Save PDF
        </button>
        <button
          type="button"
          className="report-btn report-btn-print"
          onClick={handlePrint}
          disabled={busy}
        >
          Print
        </button>
      </div>

      {showEmailInput && (
        <div className="report-email-form">
          <input
            type="email"
            placeholder="Recipient email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="button"
            className="report-btn report-btn-send"
            onClick={handleEmailSend}
            disabled={busy}
          >
            Send
          </button>
        </div>
      )}

      {message && <p className="report-actions-message">{message}</p>}
    </div>
  );
}
