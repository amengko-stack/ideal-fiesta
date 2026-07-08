import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";

const LEVELS = ["Fun", "Club", "Regional", "National"];
const LEVEL_COLOR = { Fun: M.cheer, Club: M.success, Regional: M.parentBlue, National: M.warn };
const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };

export default function TournamentSheet({ athleteId, onSaved, onClose }) {
  const [name, setName]   = useState("");
  const [date, setDate]   = useState(toLocalDateStr(new Date()));
  const [level, setLevel] = useState("Club");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "athletes", athleteId, "tournaments"), {
        name: name.trim() || "Tournament", date, level, createdAt: serverTimestamp(),
      });
      onSaved(`${name.trim() || "Tournament"} added 🏟️`);
      onClose();
    } catch (e) {
      console.error("TournamentSheet save:", e);
      onSaved("Couldn't save — try again 🙈");
    } finally {
      setSaving(false);
    }
  };

  const input = {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid #D6E2DB",
    borderRadius: 12, background: M.card, fontFamily: M.display, fontWeight: 600,
    fontSize: 14, color: M.ink, outline: "none", marginBottom: 18,
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 16 }}>Add a tournament 🏟️</div>
      <div style={label}>Tournament name</div>
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riverside Open" style={input} />
      <div style={label}>Date</div>
      <input type="date" value={date} min={toLocalDateStr(new Date())} onChange={e => setDate(e.target.value)} style={input} />
      <div style={label}>Level</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {LEVELS.map(l => {
          const sel = level === l;
          return (
            <div key={l} onClick={() => setLevel(l)} style={{
              cursor: "pointer", padding: "11px 6px", borderRadius: 14, fontSize: 14, fontWeight: 700,
              fontFamily: M.display, flex: 1, textAlign: "center", transition: "all .12s",
              background: sel ? LEVEL_COLOR[l] : M.fillAlt, color: sel ? "#fff" : "#5f7168",
              boxShadow: sel ? "0 4px 0 rgba(0,0,0,0.13)" : "none", transform: sel ? "translateY(-1px)" : "none",
            }}>{l}</div>
          );
        })}
      </div>
      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16, padding: 16,
        textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16, boxShadow: M.cta,
        opacity: saving ? 0.6 : 1,
      }}>{saving ? "Saving…" : "Save tournament ⚡"}</div>
      <div style={{ fontSize: 11.5, color: M.sub, textAlign: "center", marginTop: 12, lineHeight: 1.4 }}>
        Sunday plans automatically taper training as this date gets closer.
      </div>
    </>
  );
}
