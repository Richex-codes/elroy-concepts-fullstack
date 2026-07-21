import api from "../api/axios.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getPushPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

// Browser permission ("granted") only means notifications are *allowed* --
// it doesn't mean this device currently has an active push subscription
// (the user may have enabled then disabled them from within the app, which
// can't revoke browser permission, only drop the subscription). This checks
// the actual subscription so the UI can tell those two states apart.
export async function hasActiveSubscription() {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}

// Registers the service worker, asks for notification permission, creates
// (or reuses) a push subscription, and hands it to the server so future
// events can reach this browser/device even if nobody has the app open.
export async function enablePushNotifications() {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: permission };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { data } = await api.get("/admin/push/vapid-public-key", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.key),
    });
  }

  await api.post("/admin/push/subscribe", subscription.toJSON(), {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });

  return { ok: true };
}

export async function disablePushNotifications() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await api
    .post(
      "/admin/push/unsubscribe",
      { endpoint: subscription.endpoint },
      { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
    )
    .catch(() => {});
  await subscription.unsubscribe();
}
