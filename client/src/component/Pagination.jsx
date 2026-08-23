import React from "react";
import "../styles/Pagination.css";

export default function Pagination({ page, setPage, totalItems, pageSize }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="pagination-controls">
      <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
        Previous
      </button>
      <span className="pagination-status">
        Page {page} of {totalPages}
      </span>
      <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
        Next
      </button>
    </div>
  );
}
