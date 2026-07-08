import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { auth } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { COLORS, css } from "./styles/theme.js";
import LoginScreen from "./components/LoginScreen.jsx";
import ParentDashboard from "./components/ParentDashboard.jsx";

const AthleteMain = lazy(() => import("./tabs/AthleteMain.jsx"));
const AthleteView = lazy(() => import("./athlete/AthleteView.jsx"));

const ALLOWED_USERS = {
  'jFXQ9SamJ6QnIpaam5dLedKcFkA2': { role: 'parent',  athleteId: 'kDybMQH9lefwHI0dRway' },
  '2Hxj2FUJP4YQSvnsR2fkStu0uoC2': { role: 'parent',  athleteId: 'kDybMQH9lefwHI0dRway' },
  'qmj32jhoYnQ9OJCQCXM1soIhHPx2': { role: 'athlete', athleteId: 'kDybMQH9lefwHI0dRway' },
};

const FullScreenSpinner = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: COLORS.bg }}>
    <style>{css}</style>
    <div className="spinner" />
  </div>
);

// ─── AUTH ROUTER ─────────────────────────────────────────────────────────────
export default function App() {
  const [authState, setAuthState]         = useState("loading");
  const [user, setUser]                   = useState(null);
  const [athleteId, setAthleteId]         = useState(null);
  const [viewingAthleteId, setViewingId]  = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setAuthState("unauthenticated");
        return;
      }
      setUser(u);
      const userConfig = ALLOWED_USERS[u.uid];
      if (!userConfig) {
        await signOut(auth);
        setAuthState("unauthorized");
        return;
      }
      setAthleteId(userConfig.athleteId);
      setAuthState(userConfig.role);
    });
  }, []);

  const handleSignOut = useCallback(() => signOut(auth), []);

  if (authState === "loading") {
    return <FullScreenSpinner />;
  }

  if (authState === "unauthenticated") {
    return <LoginScreen />;
  }

  if (authState === "unauthorized") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0e14", color: "#e8edf5", fontFamily: "DM Sans, sans-serif", gap: 16 }}>
        <style>{css}</style>
        <div style={{ fontSize: "2rem" }}>🔒</div>
        <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>Access Restricted</div>
        <div style={{ color: "#5a6a7e", fontSize: "0.9rem", textAlign: "center", maxWidth: 280 }}>This app is private. You are not authorised to access it.</div>
      </div>
    );
  }

  if (authState === "parent" && viewingAthleteId) {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <AthleteMain
          athleteId={viewingAthleteId}
          isParent={true}
          user={user}
          onBack={() => setViewingId(null)}
          onSignOut={handleSignOut}
        />
      </Suspense>
    );
  }

  if (authState === "parent") {
    return (
      <ParentDashboard
        user={user}
        onSelectAthlete={(id) => setViewingId(id)}
        onSignOut={handleSignOut}
      />
    );
  }

  // authState === "athlete"
  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <AthleteView
        athleteId={athleteId}
        user={user}
        onSignOut={handleSignOut}
      />
    </Suspense>
  );
}
