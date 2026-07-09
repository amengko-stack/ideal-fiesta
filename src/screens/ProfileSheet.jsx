import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid #D6E2DB",
  borderRadius: 12, background: M.card, fontFamily: M.display, fontWeight: 600,
  fontSize: 14, color: M.ink, outline: "none", marginBottom: 18,
};

// Edits the profile fields the AI plan prompts read (schedules, coach notes).
// The Firestore field key `cheerSchedule` is historical — it now holds the
// cross-training schedule.
export default function ProfileSheet({ athleteId, profile, onSaved, onClose }) {
  const [name, setName]                     = useState(profile?.name || "");
  const [dob, setDob]                       = useState(profile?.dob || "");
  const [tennisSchedule, setTennisSchedule] = useState(profile?.tennisSchedule || "");
  const [crossSchedule, setCrossSchedule]   = useState(profile?.cheerSchedule || "");
  const [coachNotes, setCoachNotes]         = useState(profile?.coachNotes || "");
  const [saving, setSaving]                 = useState(false);

  const save = () => {
    if (saving) return;
    setSaving(true);
    // Fire-and-forget merge; only the editable fields are written.
    setDoc(doc(db, "athletes", athleteId), {
      name: name.trim(), dob,
      tennisSchedule: tennisSchedule.trim(),
      cheerSchedule: crossSchedule.trim(),
      coachNotes: coachNotes.trim().slice(0, 2000),
    }, { merge: true }).catch(e => console.error("ProfileSheet save:", e));
    onSaved("Profile updated ✓");
    onClose();
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 16 }}>Edit profile ⚙️</div>
      <div style={label}>Name</div>
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Athlete name" style={input} />
      <div style={label}>Date of birth</div>
      <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={input} />
      <div style={label}>Tennis schedule</div>
      <input type="text" value={tennisSchedule} onChange={e => setTennisSchedule(e.target.value)} placeholder="e.g. Mon, Wed, Fri — 2hrs" style={input} />
      <div style={label}>Cross-training schedule</div>
      <input type="text" value={crossSchedule} onChange={e => setCrossSchedule(e.target.value)} placeholder="e.g. Tue — swimming 1hr" style={input} />
      <div style={label}>Coach / parent notes (the AI reads these)</div>
      <textarea
        value={coachNotes} onChange={e => setCoachNotes(e.target.value)} rows={4}
        placeholder="Injuries, restrictions, things to watch — treated as hard rules by the plan generator"
        style={{ ...input, fontFamily: M.body, resize: "vertical", lineHeight: 1.5 }}
      />
      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16, padding: 16,
        textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16, boxShadow: M.cta,
        opacity: saving ? 0.6 : 1,
      }}>Save profile ✓</div>
    </>
  );
}
