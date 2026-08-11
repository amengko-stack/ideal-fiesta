// FCM background-message service worker. public/ is copied verbatim by Vite
// (not bundled), so this can't use ESM import or import.meta.env — hence
// importScripts with the compat build, and a literal config below.
//
// Pinned to the exact installed firebase version (12.13.0) rather than
// "latest" — the installed package floats, and drifting from this SW's
// gstatic URL is exactly the kind of thing that fails silently.
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

// ⚠ KEEP IN SYNC with the VITE_FIREBASE_* values that src/firebase.js reads
// from the environment. This is the same public client config the app already
// ships inlined in its bundle (the deploy workflow says as much), so it is not
// a secret — but it IS a second copy. Point it at a different project and push
// silently stops working while everything else keeps passing. Same hazard, and
// the same rule, as the UID list shared by src/App.jsx and firestore.rules.
//
// Substituting this at build time was tried and rejected: Vite copies public/
// over the build output after every plugin hook that could rewrite it, so the
// substitution needs a template outside public/ plus lint exemptions — more
// moving parts, and a new silent-failure mode, than the duplication costs.
firebase.initializeApp({
  apiKey: "AIzaSyDufUkJp_UJfVR4OF6lAJ4vdKRoQC7Q9Yc",
  authDomain: "athlete-os-15c3b.firebaseapp.com",
  projectId: "athlete-os-15c3b",
  storageBucket: "athlete-os-15c3b.firebasestorage.app",
  messagingSenderId: "120363908722",
  appId: "1:120363908722:web:4f4f569797f971e2ca0ceb",
});

const messaging = firebase.messaging();

// Never interfere with /api/ — mirrors public/sw.js's own convention, even
// though this SW has no fetch handler today.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Athlete OS";
  const body = payload.notification?.body || "";
  self.registration.showNotification(title, {
    body,
    // 180px/20KB — the only other icon asset is 512px/123KB, too heavy for
    // a notification. No monochrome asset exists, so no `badge`.
    icon: "/icons/apple-touch-icon.png",
    // Forwarding `tag` is what lets a repeating story (the Guardian sends
    // tag: "guardian") replace its own earlier notification instead of
    // stacking a fresh one every morning. `renotify` keeps the replacement
    // audible — a silent swap would mean a genuine escalation went unnoticed.
    //
    // Both are spread together and ONLY when a tag is present: the spec makes
    // renotify-without-tag a TypeError, which would take down the untagged
    // pushes — the evening check-in nudge and the Sunday digest — rather than
    // just skipping the collapse.
    ...(payload.notification?.tag
      ? { tag: payload.notification.tag, renotify: true }
      : {}),
    data: payload.data || {},
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    // This SW controls no clients (it's registered at a scope disjoint from
    // "/"), so includeUncontrolled is required — without it every tap opens
    // a new tab instead of focusing the installed PWA.
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((w) => "focus" in w);
      if (existing) return existing.focus();
      return clients.openWindow("/");
    })
  );
});
