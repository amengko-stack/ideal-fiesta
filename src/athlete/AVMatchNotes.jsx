import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  doc, getDoc, collection, getDocs, query, orderBy,
} from "firebase/firestore";
import { COLORS } from "../styles/theme.js";

// ─── AV: MATCH NOTES ─────────────────────────────────────────────────────────
export default function AVMatchNotes({ athleteId }) {
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, "athletes", athleteId, "matchAnalyses"),
          orderBy("generatedAt", "desc")
        ));
        const analyses = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => a.athleteNote);

        // Fetch parent match documents for date + opponent
        const enriched = await Promise.all(analyses.map(async a => {
          try {
            const matchSnap = await getDoc(doc(db, "matches", a.matchId || a.id));
            const m = matchSnap.exists() ? matchSnap.data() : {};
            return {
              id:           a.id,
              athleteNote:  a.athleteNote,
              generatedAt:  a.generatedAt,
              opponentName: m.opponentName || null,
              matchDate:    m.matchStartTime || null,
              won:          m.whoWonMatch === 1,
            };
          } catch (_) {
            return {
              id:          a.id,
              athleteNote: a.athleteNote,
              generatedAt: a.generatedAt,
              won:         null,
            };
          }
        }));

        setNotes(enriched);
      } catch (e) {
        console.error("Load match notes error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [athleteId]);

  const fmtDate = ts => {
    if (!ts) return null;
    return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
  };

  if (loading) return <div style={{ textAlign: "center", paddingTop: 60 }}><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 4 }}>Match Notes</div>
      <div style={{ fontSize: "0.8rem", color: COLORS.muted, marginBottom: 24 }}>Personal notes from your coach after each match.</div>

      {notes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "2.8rem", marginBottom: 14 }}>🎾</div>
          <div style={{ fontSize: "0.95rem", color: COLORS.muted, lineHeight: 1.7 }}>
            No match notes yet —<br />your coach will add notes after your next match.
          </div>
        </div>
      ) : (
        notes.map(note => (
          <div key={note.id} style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: "20px 18px",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: "0.82rem", color: COLORS.muted, fontWeight: 500 }}>
                {note.opponentName
                  ? <>vs <span style={{ color: COLORS.text, fontWeight: 700 }}>{note.opponentName}</span>{note.matchDate ? ` — ${fmtDate(note.matchDate)}` : ""}</>
                  : note.matchDate ? fmtDate(note.matchDate) : "Match"
                }
              </div>
              {note.won !== null && (
                <span style={{
                  fontSize: "0.7rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                  color:       note.won ? "#000"        : COLORS.red,
                  background:  note.won ? COLORS.accent : `${COLORS.red}20`,
                  border:      note.won ? "none"        : `1px solid ${COLORS.red}40`,
                }}>
                  {note.won ? "Win" : "Loss"}
                </span>
              )}
            </div>
            <div style={{ fontSize: "1.05rem", color: COLORS.text, lineHeight: 1.65, fontWeight: 500 }}>
              "{note.athleteNote}"
            </div>
          </div>
        ))
      )}
    </div>
  );
}
