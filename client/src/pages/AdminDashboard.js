import React, { useState, useRef, useEffect } from "react";
import "../styles/AdminDashboard.css";
import { useNavigate, useLocation, NavLink, Outlet } from "react-router-dom";
import logoImg from "../images/elroy_logo_cropped.png";
import { ADMIN_NAV_SECTIONS, ADMIN_NAV_ITEMS } from "../adminNav";
import api from "../api/axios.js";
import { isSuperAdmin } from "../utils/authUser.js";
import {
  isPushSupported,
  getPushPermission,
  hasActiveSubscription,
  enablePushNotifications,
  disablePushNotifications,
} from "../utils/pushNotifications.js";

function itemHref(item) {
  return item.path === "" ? "/admin" : `/admin/${item.path}`;
}

export default function AdminDashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("adminSidebarCollapsed") === "true"
  );
  const navigate = useNavigate();
  const location = useLocation();

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("adminSidebarCollapsed", String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await api.post(
        "/logout",
        { reason: "manual" },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
    } catch (err) {
      console.error("Failed to record logout:", err);
    }
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  const [comingSoonMsg, setComingSoonMsg] = useState("");

  useEffect(() => {
    if (!comingSoonMsg) return;
    const timer = setTimeout(() => setComingSoonMsg(""), 3500);
    return () => clearTimeout(timer);
  }, [comingSoonMsg]);

  // "checking" | "subscribed" | "unsubscribed" | "denied" | "unsupported"
  const [pushState, setPushState] = useState("checking");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    const checkPushState = async () => {
      if (!isPushSupported()) return setPushState("unsupported");
      const permission = getPushPermission();
      if (permission === "denied") return setPushState("denied");
      if (permission !== "granted") return setPushState("unsubscribed");
      setPushState((await hasActiveSubscription()) ? "subscribed" : "unsubscribed");
    };
    checkPushState();
  }, []);

  const handleToggleNotifications = async () => {
    setPushBusy(true);
    try {
      if (pushState === "subscribed") {
        await disablePushNotifications();
        setPushState("unsubscribed");
        setComingSoonMsg("Notifications turned off on this device.");
      } else {
        const result = await enablePushNotifications();
        if (!result.ok) {
          setPushState(result.reason === "denied" ? "denied" : "unsubscribed");
          setComingSoonMsg(
            result.reason === "denied"
              ? "Notifications are blocked in this browser's settings."
              : "Couldn't enable notifications on this device."
          );
        } else {
          setPushState("subscribed");
          setComingSoonMsg("Notifications enabled on this device.");
        }
      }
    } catch (err) {
      console.error("Push notification toggle failed:", err);
      setComingSoonMsg("Couldn't update notification settings.");
    } finally {
      setPushBusy(false);
    }
  };

  const handleNavClick = (item, e) => {
    if (item.disabled) {
      e.preventDefault();
      setComingSoonMsg(`${item.label} isn't available yet — coming soon.`);
      setSidebarOpen(false);
      return;
    }
    setSidebarOpen(false); // Close sidebar on link click (small screens)
  };

  // Swipe support for mobile: swipe right from the left edge to open the
  // sidebar, swipe left anywhere to close it. Hamburger/close button stay
  // as the discoverable fallback — this is additive, not a replacement.
  const touchStart = useRef(null);

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e) => {
    if (!touchStart.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    const startX = touchStart.current.x;
    touchStart.current = null;

    // Ignore mostly-vertical drags (scrolling)
    if (Math.abs(deltaX) < Math.abs(deltaY)) return;

    if (!sidebarOpen && startX < 40 && deltaX > 60) {
      setSidebarOpen(true);
    } else if (sidebarOpen && deltaX < -60) {
      setSidebarOpen(false);
    }
  };

  const currentItem =
    ADMIN_NAV_ITEMS.find((item) => location.pathname === itemHref(item)) ||
    ADMIN_NAV_ITEMS[0];

  const superAdmin = isSuperAdmin();
  const visibleSections = ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.superAdminOnly || superAdmin),
  })).filter((section) => section.items.length > 0);

  return (
    <div
      className="admin-dashboard"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {comingSoonMsg && (
        <div className="coming-soon-toast">
          <i className="fas fa-clock"></i>
          {comingSoonMsg}
        </div>
      )}

      {!sidebarOpen && (
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
        >
          <i className="fas fa-bars"></i>
        </button>
      )}

      {sidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`admin-sidebar ${sidebarOpen ? "open" : ""} ${
          collapsed ? "collapsed" : ""
        }`}
      >
        <button
          className="collapse-toggle-btn"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <i className={`fas ${collapsed ? "fa-chevron-right" : "fa-chevron-left"}`}></i>
        </button>

        <div className="admin-sidebar-brand">
          <img src={logoImg} alt="Elroy Concepts" />
          <span>Admin ERP</span>
        </div>

        <nav className="admin-sidebar-nav">
          {visibleSections.map((section) => (
            <div className="admin-sidebar-section" key={section.label}>
              <p className="admin-sidebar-section-label">{section.label}</p>
              <ul>
                {section.items.map((item) =>
                  item.disabled ? (
                    <li
                      key={item.key}
                      className="disabled"
                      onClick={(e) => handleNavClick(item, e)}
                      title={`${item.label} — coming soon`}
                    >
                      <i className={`fas ${item.icon}`}></i>
                      <span>{item.label}</span>
                      <span className="coming-soon-badge">Soon</span>
                    </li>
                  ) : (
                    <li key={item.key}>
                      <NavLink
                        to={itemHref(item)}
                        end={item.path === ""}
                        className={({ isActive }) => (isActive ? "active" : "")}
                        onClick={(e) => handleNavClick(item, e)}
                        title={item.label}
                      >
                        <i className={`fas ${item.icon}`}></i>
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </nav>

        <ul className="admin-sidebar-footer">
          {pushState !== "unsupported" && (
            <li
              className={`admin-sidebar-notifications ${pushBusy ? "busy" : ""}`}
              onClick={
                pushState === "denied"
                  ? () =>
                      setComingSoonMsg(
                        "Notifications are blocked for this site — enable them in your browser's site settings first."
                      )
                  : handleToggleNotifications
              }
              title={
                pushState === "subscribed"
                  ? "Notifications are on for this device — click to turn off"
                  : pushState === "denied"
                  ? "Notifications are blocked in this browser"
                  : "Turn on notifications for this device"
              }
            >
              <i className={`fas ${pushState === "subscribed" ? "fa-bell" : "fa-bell-slash"}`}></i>
              <span>
                {pushState === "subscribed"
                  ? "Notifications On"
                  : pushState === "denied"
                  ? "Notifications Blocked"
                  : "Enable Notifications"}
              </span>
            </li>
          )}
          <li
            className="admin-sidebar-logout"
            onClick={handleLogout}
            title="Logout"
          >
            <i className="fas fa-right-from-bracket"></i>
            <span>Logout</span>
          </li>
        </ul>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <span className="admin-topbar-icon">
            <i className={`fas ${currentItem.icon}`}></i>
          </span>
          <h1>{currentItem.label}</h1>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
