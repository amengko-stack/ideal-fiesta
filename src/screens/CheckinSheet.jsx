import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";
import { XP } from "../lib/gamification.js";
import { awardXp } from "../lib/gamificationStore.js";

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };

function StarRow({ value, onChange, color }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <div key={n} onClick={() => onChange(n)} style={{
          cursor: "pointer", fontSize: 30, lineHeight: 1, transition: "transform .1s",
          color: n <= value ? color : "#D6E2DB", transform: n <= value ? "scale(1.1)" : "none",
        }}>★</div>
      ))}
    </div>
  );
}

export default function CheckinSheet({ athleteId, initial, onSaved, onClose }) {
  const [mood, setMood]         = useState(initial?.mood ?? 4);
  const [sleep, setSleep]       = useState(initial?.sleep ?? 8);
  const [soreness, setSoreness] = useState(initial?.soreness ?? 2);
  const [saving, setSaving]     = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date();
      await addDoc(collection(db, "athletes", athleteId, "wellbeing"), {
        type: "checkin", mood, sleep, soreness,
        date: toLocalDateStr(now), time: now.toTimeString().slice(0, 5),
      });
      await awardXp(athleteId, XP.CHECKIN);
      onSaved(`Check-in saved · +${XP.CHECKIN} XP ✨`);
      onClose();
    } catch (e) {
      console.error("CheckinSheet save:", e);
      onSaved("Couldn't save — try again 🙈");
    } finally {
      setSaving(false);
    }
  };

  const stepBtn = {
    cursor: "pointer", width: 42, height: 42, borderRadius: 13, background: M.fillAlt,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: M.display, fontWeight: 700, fontSize: 22, color: "#5f7168",
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 18 }}>Daily check-in ✨</div>

      <div style={label}>Mood 😊</div>
      <StarRow value={mood} onChange={setMood} color={M.match} />

      <div style={label}>Sleep 😴</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div onClick={() => setSleep(s => Math.max(4, s - 1))} style={stepBtn}>−</div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 30, color: M.success }}>{sleep}</span>
          <span style={{ fontSize: 14, color: M.sub, fontWeight: 600 }}> hours</span>
        </div>
        <div onClick={() => setSleep(s => Math.min(12, s + 1))} style={stepBtn}>+</div>
      </div>

      <div style={label}>Soreness 💪</div>
      <StarRow value={soreness} onChange={setSoreness} color={M.streakOrange} />

      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16,
        padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
        fontSize: 16, boxShadow: M.cta, opacity: saving ? 0.6 : 1, marginTop: 4,
      }}>{saving ? "Saving…" : "Save check-in ✨"}</div>
    </>
  );
}
