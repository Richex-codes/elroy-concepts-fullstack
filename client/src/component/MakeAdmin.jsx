import React, { useState, useEffect, useRef } from "react";
import api from "../api/axios.js";
import ConfirmModal from "./ConfirmModal.jsx";
import { useConfirm } from "../utils/useConfirm.js";
import "../styles/MakeAdmin.css";

const authHeaders = {
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
};

export default function MakeAdmin() {
  const [email, setEmail] = useState("");
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [branches, setBranches] = useState([]);
  const [pending, setPending] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const { confirm, modalProps } = useConfirm();
  const formRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [branchesRes, pendingRes, adminsRes] = await Promise.all([
        api.get("/admin/branches", authHeaders),
        api.get("/admin/pending-admins", authHeaders),
        api.get("/admin/admins", authHeaders),
      ]);
      setBranches(branchesRes.data);
      setPending(pendingRes.data);
      setAdmins(adminsRes.data);
    } catch (err) {
      console.error("Error loading admin management data:", err);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const toggleBranch = (branchId) => {
    setSelectedBranches((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  };

  // Clicking a pending request pre-fills the form below with their email
  // instead of the superadmin having to retype it.
  const handlePickPending = (candidateEmail) => {
    setEmail(candidateEmail);
    setSelectedBranches([]);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    const branchNames = branches
      .filter((b) => selectedBranches.includes(b._id))
      .map((b) => b.name)
      .join(", ");

    const confirmed = await confirm(
      `Make "${email}" an admin for ${branchNames}? They'll get access to inventory and sales for ${selectedBranches.length > 1 ? "these branches" : "this branch"} only. Only do this for people you trust.`,
      { title: "Make admin", confirmLabel: "Make Admin" }
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await api.post(
        "/admin/make-admin",
        { email, branches: selectedBranches },
        authHeaders
      );
      setIsError(false);
      setMessage(res.data.msg);
      setEmail("");
      setSelectedBranches([]);
      fetchAll();
    } catch (err) {
      setIsError(true);
      setMessage(err.response?.data?.msg || "Failed to promote this user.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBranch = async (admin, branchId, branchName) => {
    const isLastBranch = admin.adminBranches.length === 1;
    const confirmed = await confirm(
      isLastBranch
        ? `Remove ${admin.name}'s access to ${branchName}? Since it's their only branch, this fully relieves them of admin access.`
        : `Remove ${admin.name}'s access to ${branchName}?`,
      { title: "Remove branch access", confirmLabel: "Remove", danger: true }
    );
    if (!confirmed) return;

    try {
      const res = await api.patch(
        `/admin/admins/${admin._id}/remove-branch`,
        { branch: branchId },
        authHeaders
      );
      setIsError(false);
      setMessage(res.data.msg);
      fetchAll();
    } catch (err) {
      setIsError(true);
      setMessage(err.response?.data?.msg || "Failed to remove branch access.");
    }
  };

  const handleDeactivate = async (admin) => {
    const confirmed = await confirm(
      `Fully relieve ${admin.name} of admin access to all branches? Their account reverts to a regular customer.`,
      { title: "Deactivate admin", confirmLabel: "Deactivate", danger: true }
    );
    if (!confirmed) return;

    try {
      const res = await api.delete(`/admin/admins/${admin._id}`, authHeaders);
      setIsError(false);
      setMessage(res.data.msg);
      fetchAll();
    } catch (err) {
      setIsError(true);
      setMessage(err.response?.data?.msg || "Failed to deactivate admin.");
    }
  };

  return (
    <div className="make-admin-page">
      <div className="make-admin-icon">
        <i className="fas fa-user-shield"></i>
      </div>
      <h2>Make Admin</h2>
      <p className="make-admin-subtitle">
        Grant an already-registered user branch admin access. The user must sign up first —
        this only upgrades an existing account, it doesn't create one.
      </p>

      {message && (
        <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>
          {message}
        </div>
      )}

      {pending.length > 0 && (
        <div className="admin-list-section">
          <h3>Pending Admin Requests</h3>
          <p className="admin-list-hint">
            These accounts checked "I am a business admin" at signup and are waiting for a
            role. Click one to fill in the form below.
          </p>
          <ul className="admin-list">
            {pending.map((p) => (
              <li key={p._id} className="admin-list-item">
                <div>
                  <strong>{p.name}</strong>
                  <span className="admin-list-email">{p.email}</span>
                </div>
                <button
                  type="button"
                  className="admin-list-action"
                  onClick={() => handlePickPending(p.email)}
                >
                  Assign role
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="make-admin-form" ref={formRef}>
        <label htmlFor="make-admin-email">User's email</label>
        <input
          id="make-admin-email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label>Branch(es)</label>
        <div className="make-admin-branch-list">
          {branches.map((b) => (
            <label key={b._id} className="make-admin-branch-option">
              <input
                type="checkbox"
                checked={selectedBranches.includes(b._id)}
                onChange={() => toggleBranch(b._id)}
              />
              {b.name}
            </label>
          ))}
        </div>

        <button type="submit" disabled={loading || selectedBranches.length === 0}>
          <i className="fas fa-user-shield"></i>{" "}
          {loading ? "Promoting..." : "Make Admin"}
        </button>
      </form>

      {admins.length > 0 && (
        <div className="admin-list-section">
          <h3>Current Admins</h3>
          <ul className="admin-list admin-list-current">
            {admins.map((a) => (
              <li key={a._id} className="admin-list-item admin-list-item-stacked">
                <div>
                  <strong>{a.name}</strong>
                  <span className="admin-list-email">{a.email}</span>
                </div>
                <div className="admin-branch-tags">
                  {a.adminBranches.map((b) => (
                    <span key={b._id} className="admin-branch-tag">
                      {b.name}
                      <button
                        type="button"
                        title={`Remove ${b.name}`}
                        onClick={() => handleRemoveBranch(a, b._id, b.name)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="admin-list-deactivate"
                  onClick={() => handleDeactivate(a)}
                >
                  Deactivate all access
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmModal {...modalProps} />
    </div>
  );
}
