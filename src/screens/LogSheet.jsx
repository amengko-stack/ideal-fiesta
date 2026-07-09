import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";
import { sessionSRPE } from "../lib/load.js";
import { xpForSession } from "../lib/gamification.js";
import { awardXp } from "../lib/gamificationStore.js";

const TYPES = [
  { id: "tennis",   label: "Tennis",   accent: M.tennisLight },
  { id: "strength", label: "Strength", accent: M.strength },
  { id: "match",    label: "Match",    accent: M.match },
  { id: "other",    label: "Other",    accent: M.other },
];
const DURS = [30, 45, 60, 90];
// Focus options mirror the classic LogTab (the AI plan prompts read `focus`).
const TENNIS_FOCUS = ["Baseline rallying", "Serve practice", "Footwork / movement", "Match play", "Volley / net", "Conditioning", "Full practice"];
const OTHER_FOCUS  = ["Practice / Training", "Competition", "Conditioning", "Full session"];

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };
const chip = (sel, accent) => ({
  cursor: "pointer", padding: "11px 6px", borderRadius: 14, fontSize: 14, fontWeight: 700,
  fontFamily: M.display, flex: 1, textAlign: "center", transition: "all .12s",
  background: sel ? accent : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
  boxShadow: sel ? "0 4px 0 rgba(0,0,0,0.13)" : "none", transform: sel ? "translateY(-1px)" : "none",
});

export default function LogSheet({ athleteId, onSaved, onClose }) {
  const [type, setType]           = useState("tennis");
  const [sportName, setSportName] = useState("");
  const [dur, setDur]             = useState(60);
  const [rpe, setRpe]             = useState(6);
  const [feel, setFeel]           = useState(4);
  const [win, setWin]             = useState(true);
  const [date, setDate]           = useState(toLocalDateStr(new Date()));
  const [focus, setFocus]         = useState("");
  const [saving, setSaving]       = useState(false);

  const focusOptions = type === "tennis" ? TENNIS_FOCUS : type === "other" ? OTHER_FOCUS : null;

  const save = () => {
    if (saving) return;
    setSaving(true);
    const now = new Date();
    const entry = {
      type, duration: dur, rpe, feel,
      date: date || toLocalDateStr(now), time: now.toTimeString().slice(0, 5),
      ...(focus && focusOptions ? { focus } : {}),
      ...(type === "other" ? { sportName: sportName.trim() || "Other sport" } : {}),
      ...(type === "match" ? { result: win ? "W" : "L" } : {}),
    };
    // Fire-and-forget (latency compensation): Firestore commits locally at once
    // and syncs when online — awaiting server ack would hang the sheet offline.
    addDoc(collection(db, "athletes", athleteId, "weekLogs"), entry)
      .catch(e => console.error("LogSheet save:", e));
    const xp = xpForSession(sessionSRPE(entry));
    awardXp(athleteId, xp).catch(e => console.error("LogSheet xp:", e));
    onSaved(`+${xp} XP · awesome! 🎾`);
    onClose();
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 16 }}>Log a session 🎾</div>

      <div style={label}>Type</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {TYPES.map(t => (
          <div key={t.id} onClick={() => { setType(t.id); setFocus(""); }} style={chip(type === t.id, t.accent)}>{t.label}</div>
        ))}
      </div>

      <div style={label}>When?</div>
      <input
        type="date" value={date} max={toLocalDateStr(new Date())}
        onChange={e => setDate(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", padding: "12px 14px",
          border: "1.5px solid #D6E2DB", borderRadius: 12, background: M.card,
          fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink,
          outline: "none", marginBottom: 18,
        }}
      />

      {type === "other" && (
        <>
          <div style={label}>Which sport?</div>
          <input
            type="text" value={sportName} onChange={e => setSportName(e.target.value)}
            placeholder="e.g. Swimming, Athletics, Netball"
            style={{
              width: "100%", boxSizing: "border-box", padding: "12px 14px",
              border: "1.5px solid #D6E2DB", borderRadius: 12, background: M.card,
              fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink,
              outline: "none", marginBottom: 18,
            }}
          />
        </>
      )}

      <div style={label}>Duration</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {DURS.map(d => (
          <div key={d} onClick={() => setDur(d)} style={chip(dur === d, M.strength)}>{d}m</div>
        ))}
      </div>

      {focusOptions && (
        <>
          <div style={label}>Focus (optional)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {focusOptions.map(f => {
              const sel = focus === f;
              return (
                <div key={f} onClick={() => setFocus(sel ? "" : f)} style={{
                  cursor: "pointer", padding: "8px 13px", borderRadius: 20, fontFamily: M.display,
                  fontWeight: 700, fontSize: 12,
                  border: sel ? "1.5px solid transparent" : "1.5px solid #D6E2DB",
                  background: sel ? M.gradient : M.card, color: sel ? M.deepGreen : M.muted,
                }}>{f}</div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <span style={{ ...label, marginBottom: 0 }}>Effort</span>
        <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 20, color: M.success }}>
          {rpe}<span style={{ fontSize: 11, color: M.sub }}>/10</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <div key={n} onClick={() => setRpe(n)} style={{
            cursor: "pointer", flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10,
            fontSize: 13, fontWeight: 700, fontFamily: M.display, transition: "all .1s",
            background: rpe === n ? M.strength : M.fillAlt, color: rpe === n ? M.deepGreen : "#5f7168",
          }}>{n}</div>
        ))}
      </div>

      {type === "match" && (
        <>
          <div style={label}>Result</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <div onClick={() => setWin(true)} style={chip(win, M.strength)}>Win 🏆</div>
            <div onClick={() => setWin(false)} style={chip(!win, M.danger)}>Loss</div>
          </div>
        </>
      )}

      <div style={label}>How did it feel?</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} onClick={() => setFeel(n)} style={{
            cursor: "pointer", fontSize: 32, lineHeight: 1, transition: "transform .1s",
            color: n <= feel ? M.match : "#D6E2DB", transform: n <= feel ? "scale(1.1)" : "none",
          }}>★</div>
        ))}
      </div>

      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16,
        padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
        fontSize: 16, boxShadow: M.cta, opacity: saving ? 0.6 : 1,
      }}>{saving ? "Saving…" : "Save & earn XP 🎉"}</div>
    </>
  );
}
