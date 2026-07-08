import { useState, useEffect, useRef } from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M, mobileCss } from "../styles/mobileTheme.js";
import { computeStreak } from "../lib/streak.js";
import { toLocalDateStr } from "../lib/dates.js";
import Header from "../ui/Header.jsx";
import BottomNav from "../ui/BottomNav.jsx";
import BottomSheet from "../ui/BottomSheet.jsx";
import Toast from "../ui/Toast.jsx";
import PlaceholderScreen from "./PlaceholderScreen.jsx";

const SCREENS = {
  home:    { kicker: null,              label: "Home",    emoji: "🏠", note: "Your energy, level and day at a glance — coming in the next update." },
  load:    { kicker: "Training load",   label: "Load",    emoji: "📊", note: "Weekly load, ACWR and where it comes from — coming soon." },
  matches: { kicker: "Season so far",   label: "Matches", emoji: "🎾", note: "Match history, win rate and season intelligence — coming soon." },
  plan:    { kicker: "Your plan",       label: "Plan",    emoji: "📋", note: "Your Sunday session, tuned to your week — coming soon." },
  me:      { kicker: "Profile & tools", label: "Profile", emoji: "⭐", note: "Profile, focus areas and coach tools — coming soon." },
};

// NOTE: the call site also passes { isParent, user, onSignOut } (contractual for later
// slices); destructure them here only when a slice starts consuming them.
export default function MobileApp({ athleteId }) {
  const [screen, setScreen]   = useState("home");
  const [name, setName]       = useState("");
  const [streak, setStreak]   = useState(0);
  const [sheetOpen, setSheet] = useState(false);
  const [toast, setToast]     = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Profile name for the header
    getDoc(doc(db, "athletes", athleteId))
      .then((snap) => { if (snap.exists()) setName(snap.data().name || ""); })
      .catch((e) => console.error("MobileApp profile load:", e));

    // Streak: any entry (activity, strength, check-in) in the last 60 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoff = toLocalDateStr(cutoffDate);
    Promise.all(["weekLogs", "sessions", "wellbeing"].map((col) =>
      getDocs(query(collection(db, "athletes", athleteId, col), where("date", ">=", cutoff)))
    ))
      .then((snaps) => {
        const dates = snaps.flatMap((s) => s.docs.map((d) => d.data().date)).filter(Boolean);
        setStreak(computeStreak(dates, toLocalDateStr(new Date())).current);
      })
      .catch((e) => console.error("MobileApp streak load:", e));
  }, [athleteId]);

  const firstName = (name || "Athlete").split(" ")[0];
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const kicker = screen === "home" ? `${weekday} · let's play` : SCREENS[screen].kicker;
  const title = screen === "home" ? `Hi, ${firstName}!` : screen === "me" ? firstName
    : screen.charAt(0).toUpperCase() + screen.slice(1);
  const sc = SCREENS[screen];

  return (
    <div style={{ minHeight: "100vh", background: M.pageBg }}>
      <style>{mobileCss}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "22px 16px 110px" }}>
        <Header
          kicker={kicker}
          title={title}
          streak={streak}
          initial={firstName.charAt(0).toUpperCase() || "A"}
          onAvatar={() => setScreen("me")}
        />
        <div key={screen} style={{ animation: "screenIn .25s ease" }}>
          <PlaceholderScreen emoji={sc.emoji} title={`${sc.label} is on its way`} note={sc.note} />
        </div>
      </div>

      <BottomNav active={screen} onNav={setScreen} onFab={() => setSheet(true)} />

      <BottomSheet open={sheetOpen} onClose={() => setSheet(false)}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 6 }}>Log a session 🎾</div>
        <div style={{ fontSize: 13, color: M.sub, marginBottom: 18, lineHeight: 1.5 }}>
          Session logging lands here in the next update. Until then, keep using the classic logger — every session still counts!
        </div>
        <div
          onClick={() => { setSheet(false); showToast("Logging arrives soon ✨"); }}
          style={{
            cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16,
            padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
            fontSize: 16, boxShadow: M.cta,
          }}
        >Got it ⚡</div>
      </BottomSheet>

      <Toast message={toast} />
    </div>
  );
}
