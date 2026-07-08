import { useState } from "react";
import { auth } from "../firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { COLORS, css } from "../styles/theme.js";

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: COLORS.bg, padding: 16 }}>
      <style>{css}</style>
      <div className="card" style={{ maxWidth: 420, width: "100%", textAlign: "center", padding: "40px 32px" }}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: COLORS.accent, marginBottom: 6, letterSpacing: "0.06em" }}>Performance Tracker</h1>
        <p style={{ color: COLORS.muted, fontSize: "0.82rem", marginBottom: 36 }}>Tennis · Cheerleading · Strength</p>
        <button
          className="btn btn-primary"
          onClick={handleGoogle}
          disabled={loading}
          style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "0.95rem" }}
        >
          {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in…</> : "Sign in with Google"}
        </button>
        {error && <div className="note-box warn" style={{ marginTop: 16, textAlign: "left" }}>{error}</div>}
      </div>
    </div>
  );
}
