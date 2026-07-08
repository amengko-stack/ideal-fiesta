import { useState, useEffect } from "react";
import { Users } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { COLORS, css } from "../styles/theme.js";

// ─── PARENT DASHBOARD ────────────────────────────────────────────────────────
const KNOWN_ATHLETE_ID = "kDybMQH9lefwHI0dRway";

export default function ParentDashboard({ user, onSelectAthlete, onSignOut }) {
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "athletes", KNOWN_ATHLETE_ID))
      .then(snap => { if (snap.exists()) setAthlete({ id: snap.id, ...snap.data() }); })
      .catch(e => console.error("Load athlete error:", e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="flex-between" style={{ alignItems: "center" }}>
            <div>
              <h1>Performance Tracker</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.7rem", background: COLORS.accentMuted, color: COLORS.accent, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Parent</span>
                <span style={{ fontSize: "0.75rem", color: COLORS.muted }}>{user.displayName}</span>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
          </div>
        </div>

        <div className="card">
          <div className="card-title"><Users size={18} /> Athletes</div>
          {loading
            ? <div className="empty"><div className="spinner" /></div>
            : !athlete
              ? <div className="empty">Athlete profile not found.</div>
              : (
                <div
                  className="log-item athlete-row"
                  onClick={() => onSelectAthlete(athlete.id)}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{athlete.name}</span>
                    {athlete.gaps?.length > 0 && (
                      <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>
                        {athlete.gaps.length} tennis gap{athlete.gaps.length !== 1 ? "s" : ""} set
                      </div>
                    )}
                  </div>
                  <span style={{ color: COLORS.accent, fontWeight: 600 }}>View →</span>
                </div>
              )
          }
        </div>
      </div>
    </div>
  );
}
