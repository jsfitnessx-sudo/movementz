import { supabase } from "./supabase/client.js";

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported() {
  return Boolean(
    typeof window !== "undefined"
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window
  );
}

export async function registerMovementzServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function getPushStatus() {
  if (!isPushSupported()) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    configured: Boolean(vapidPublicKey)
  };
}

export async function enablePhonePushNotifications() {
  if (!isPushSupported()) {
    throw new Error("This browser does not support web push notifications.");
  }

  if (!vapidPublicKey) {
    throw new Error("Phone notifications are not configured yet. Add VITE_VAPID_PUBLIC_KEY in Vercel.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications were not allowed on this device.");
  }

  const registration = await registerMovementzServiceWorker();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });
  const json = subscription.toJSON();

  const { error } = await supabase.rpc("save_push_subscription", {
    push_endpoint: json.endpoint,
    push_p256dh: json.keys?.p256dh,
    push_auth: json.keys?.auth,
    push_user_agent: navigator.userAgent
  });

  if (error) {
    throw new Error(`${error.message}. Run supabase/phase-27-push-notifications.sql in Supabase.`);
  }

  return getPushStatus();
}

export async function sendPhonePushToUser({ recipientId, title, body, url = "/", type = "message" }) {
  if (!recipientId || !supabase) return { sent: 0 };

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { sent: 0 };

  const response = await fetch("/api/send-push", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ recipientId, title, body, url, type })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || "Could not send phone notification.");
  }

  return response.json();
}
