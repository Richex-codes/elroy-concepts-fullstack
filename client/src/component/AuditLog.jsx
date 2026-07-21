import React, { useEffect, useState, useCallback } from "react";
import api from "../api/axios.js";
import "../styles/AuditLog.css";

const ACTION_META = {
  "sale.created": { label: "Sale Created", tone: "positive" },
  "sale.deleted": { label: "Sale Deleted", tone: "negative" },
  "debtor.cleared": { label: "Debt Cleared", tone: "positive" },
  "inventory.restocked": { label: "Inventory Restocked", tone: "positive" },
  "product.deleted": { label: "Product Deleted", tone: "negative" },
  "user.promoted_to_admin": { label: "User Made Admin", tone: "negative" },
};

const DATE_KEY_PATTERN = /date|at$/i;

function formatKey(key) {
  return key
    .replace(/Name$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatScalar(key, value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return value.toLocaleString("en-NG");
  if (typeof value === "string" && DATE_KEY_PATTERN.test(key) && !isNaN(Date.parse(value))) {
    return new Date(value).toLocaleDateString();
  }
  return String(value);
}

// Renders a before/after snapshot: flat fields as label/value rows, and
// any nested array (e.g. sale items, restored inventory lines) as a
// compact list instead of being silently dropped.
function DetailCell({ value }) {
  if (value === null || value === undefined || typeof value !== "object") {
    return <span className="audit-empty">—</span>;
  }

  const entries = Object.entries(value).filter(
    ([, v]) => v !== null && v !== undefined
  );
  if (entries.length === 0) return <span className="audit-empty">—</span>;

  return (
    <div className="audit-detail">
      {entries.map(([key, val]) => {
        if (Array.isArray(val)) {
          if (val.length === 0) return null;
          return (
            <div className="audit-detail-row" key={key}>
              <span className="audit-detail-label">{formatKey(key)}</span>
              <ul className="audit-item-list">
                {val.map((line, i) => (
                  <li key={i}>
                    {Object.entries(line)
                      .filter(([, lv]) => lv !== null && lv !== undefined)
                      .map(([lk, lv]) => `${formatKey(lk)}: ${formatScalar(lk, lv)}`)
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (typeof val === "object") return null;
        return (
          <div className="audit-detail-row" key={key}>
            <span className="audit-detail-label">{formatKey(key)}</span>
            <span>{formatScalar(key, val)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const authHeaders = {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  };

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/audit-log", {
        ...authHeaders,
        params: { action, actor, fromDate, toDate },
      });
      setEntries(res.data);
    } catch (err) {
      console.error("Failed to load audit log", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, actor, fromDate, toDate]);

  // Fetch once on mount only -- filters apply on Search click (matching
  // every other filtered list in the app), not on every keystroke. Without
  // this, typing into the actor search box fired one request per
  // character, and out-of-order responses could leave the table showing
  // results for an earlier, already-overwritten search term.
  useEffect(() => {
    fetchLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="audit-log-page">
      <h2>Audit Log</h2>
      <p className="audit-log-subtitle">
        A permanent, read-only record of who did what. Nothing here can be
        edited or deleted from the app. Showing this year by default — pick
        a date range to look further back.
      </p>

      <div className="audit-log-filters">
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All Actions</option>
          {Object.entries(ACTION_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search by admin name/email"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        />

        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />

        <button onClick={fetchLog}>Search</button>
      </div>

      <div className="audit-log-table-container">
        <table className="audit-log-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="table-empty-state">Loading...</td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-empty-state">No audit entries found.</td>
              </tr>
            ) : (
              entries.map((entry, idx) => (
                <tr key={entry._id} className={idx % 2 === 1 ? "row-alt" : ""}>
                  <td className="audit-when-cell" data-label="When">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td data-label="Admin">
                    {entry.actorName || "Unknown"}
                    <br />
                    <small>{entry.actorEmail}</small>
                  </td>
                  <td data-label="Action">
                    <span
                      className={`audit-action-badge audit-action-${
                        ACTION_META[entry.action]?.tone || "neutral"
                      }`}
                    >
                      {ACTION_META[entry.action]?.label || entry.action}
                    </span>
                  </td>
                  <td data-label="Before">
                    <DetailCell value={entry.before} />
                  </td>
                  <td data-label="After">
                    <DetailCell value={entry.after} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
