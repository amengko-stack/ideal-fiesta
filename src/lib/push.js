import { getApp } from "firebase/app";
import { doc, deleteDoc, setDoc } from "firebase/firestore";
import { isSupported, getMessaging, getToken, deleteToken, onMessage } from "firebase/messaging";
import { db } from "../firebase.js";

// Lazy singleton: getMessaging() throws in browsers without the messaging
// APIs (most non-Safari-iOS-16.4+ cases), so callers must check
// isPushSupported()/isSupported() before anything here touches it.
let messagingInstance = null;
function getMessagingInstance() {
  if (!messagingInstance) messagingInstance = getMessaging(getApp());
  return messagingInstance;
}

// The doc ID *is* the token, so cleanup after a revoked permission needs to
// know the last token we stored — remembered locally per athlete since we
// have no other way to look it up once Notification.permission is gone.
const lastTokenKey = (athleteId) => `push:lastToken:${athleteId}`;

export async function isPushSupported() {
  return (await isSupported()) && "Notification" in window;
}

// "granted" | "denied" | "default" | "unsupported"
export function pushPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function tokenDocRef(athleteId, token) {
  return doc(db, "athletes", athleteId, "pushTokens", token);
}

// Requests permission, registers the FCM service worker (the messaging SDK
// does this itself — see main.jsx/App comments), and stores the resulting
// token so the scheduled Cloud Function can find this device. Returns
// { ok, reason } instead of throwing for the expected failure paths — the
// settings row needs to explain each one to Valissa, not just fail silently.
export async function enablePush({ athleteId, uid, role }) {
  // Vite serves public/ in dev too, so the FCM SW would otherwise register
  // at localhost — this app's SW policy (see main.jsx) is deliberately
  // prod-only.
  if (!import.meta.env.PROD) return { ok: false, reason: "dev-mode" };
  if (!(await isPushSupported())) return { ok: false, reason: "unsupported" };

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) return { ok: false, reason: "missing-vapid-key" };

  // Safari rejects requestPermission() when it isn't called with fresh
  // transient user activation, and the `await` above is exactly the kind of gap
  // that spends it. That rejection must still come back as a reason the
  // settings row can explain, not an unhandled promise.
  let permission;
  try {
    permission = await Notification.requestPermission();
  } catch (e) {
    console.error("requestPermission failed:", e);
    return { ok: false, reason: "gesture-lost" };
  }
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };

  try {
    const messaging = getMessagingInstance();
    // Do NOT pass sw.js's registration here — let the SDK register its own
    // SW at the disjoint /firebase-cloud-messaging-push-scope scope.
    const token = await getToken(messaging, { vapidKey });
    if (!token) return { ok: false, reason: "no-token" };

    const now = new Date().toISOString();
    await setDoc(tokenDocRef(athleteId, token), {
      token, uid, role, platform: navigator.userAgent, enabledAt: now, lastSeenAt: now,
    });
    await setDoc(doc(db, "athletes", athleteId), { remindersEnabled: true }, { merge: true });
    try { localStorage.setItem(lastTokenKey(athleteId), token); } catch { /* best-effort */ }
    return { ok: true, token };
  } catch (e) {
    console.error("enablePush failed:", e);
    return { ok: false, reason: "error" };
  }
}

export async function disablePush({ athleteId, token }) {
  const storedToken = token || (() => { try { return localStorage.getItem(lastTokenKey(athleteId)); } catch { return null; } })();
  try {
    const messaging = getMessagingInstance();
    await deleteToken(messaging);
  } catch (e) {
    console.error("disablePush: deleteToken failed:", e);
  }
  try {
    if (storedToken) await deleteDoc(tokenDocRef(athleteId, storedToken));
    await setDoc(doc(db, "athletes", athleteId), { remindersEnabled: false }, { merge: true });
    try { localStorage.removeItem(lastTokenKey(athleteId)); } catch { /* best-effort */ }
  } catch (e) {
    console.error("disablePush: cleanup failed:", e);
  }
}

// Call on app open: keeps the stored token fresh (iOS rotates them
// aggressively, especially after a PWA reinstall) and — just as important —
// clears the stored doc when the OS permission has been revoked, so the app
// flag and the OS permission never drift apart. Never throws into the
// caller; swallows and logs like the repo's other fire-and-forget paths.
export async function refreshPushToken({ athleteId, uid, role }) {
  try {
    if (!import.meta.env.PROD) return;
    if (!(await isPushSupported()) || Notification.permission !== "granted") {
      // Permission was revoked (or never granted) since we last stored a
      // token — delete that stored doc so the app flag and the OS
      // permission don't drift apart.
      try {
        const stale = localStorage.getItem(lastTokenKey(athleteId));
        if (stale) {
          await deleteDoc(tokenDocRef(athleteId, stale));
          localStorage.removeItem(lastTokenKey(athleteId));
        }
      } catch { /* best-effort cleanup */ }
      return;
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return;

    const messaging = getMessagingInstance();
    const token = await getToken(messaging, { vapidKey });
    if (!token) return;

    const now = new Date().toISOString();
    await setDoc(tokenDocRef(athleteId, token), {
      token, uid, role, platform: navigator.userAgent, lastSeenAt: now,
    }, { merge: true });
    try { localStorage.setItem(lastTokenKey(athleteId), token); } catch { /* best-effort */ }
  } catch (e) {
    console.error("refreshPushToken failed:", e);
  }
}

// Wraps onMessage; returns the unsubscribe function.
export function onForegroundMessage(cb) {
  const messaging = getMessagingInstance();
  return onMessage(messaging, cb);
}
