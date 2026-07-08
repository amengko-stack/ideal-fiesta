import { useState, useEffect } from "react";
import { Sun, Moon, Trash2 } from "lucide-react";
import { db } from "../firebase";
import {
  doc, addDoc, deleteDoc, collection, getDocs, query, orderBy, limit,
} from "firebase/firestore";
import { toLocalDateStr } from "../lib/dates.js";
import { COLORS } from "../styles/theme.js";

function EmojiRow({ options, value, onChange, activeColor }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      {options.map(({ icon, label }, i) => {
        const n = i + 1;
        return (
          <button
            key={n} onClick={() => onChange(n)}
            style={{
              flex: 1, padding: "14px 4px", borderRadius: 12,
              border: `2px solid ${value === n ? activeColor : COLORS.border}`,
              background: value === n ? `${activeColor}18` : "transparent",
              fontSize: "1.4rem", cursor: "pointer", transition: "all 0.15s",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            }}
          >
            {icon}
            <span style={{ fontSize: "0.65rem", color: value === n ? activeColor : COLORS.muted, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function NumGrid({ value, onChange, color }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 8 }}>
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <button
          key={n} onClick={() => onChange(n)}
          style={{
            padding: "14px 4px", borderRadius: 10,
            border: `2px solid ${value === n ? color : COLORS.border}`,
            background: value === n ? `${color}18` : "transparent",
            color: value === n ? color : COLORS.muted,
            fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", fontWeight: 700,
            cursor: "pointer", transition: "all 0.15s",
          }}
        >{n}</button>
      ))}
    </div>
  );
}

// ─── AV: WELLBEING CHECK ──────────────────────────────────────────────────────
export default function AVWellbeing({ athleteId }) {
  // Morning state
  const [sleep, setSleep]       = useState(null);
  const [moodAM, setMoodAM]     = useState(null);
  const [sorenessAM, setSorenessAM] = useState(null);
  const [savingAM, setSavingAM] = useState(false);
  const [savedAM, setSavedAM]   = useState(false);

  // Night state
  const [energy, setEnergy]     = useState(null);
  const [moodPM, setMoodPM]     = useState(null);
  const [sorenessPM, setSorenessPM] = useState(null);
  const [notes, setNotes]       = useState("");
  const [savingPM, setSavingPM] = useState(false);
  const [savedPM, setSavedPM]   = useState(false);

  // History
  const [history, setHistory]   = useState([]);
  const [histLoading, setHistLoading] = useState(true);
  const [confirmDeleteWell, setConfirmDeleteWell] = useState(null);

  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = toLocalDateStr(cutoff);
    getDocs(query(
      collection(db, "athletes", athleteId, "wellbeing"),
      orderBy("date", "desc"), limit(30)
    ))
      .then(snap => setHistory(
        snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.date >= cutoffStr)
      ))
      .catch(e => console.error("Load wellbeing history error:", e))
      .finally(() => setHistLoading(false));
  }, [athleteId]);

  const handleDeleteWell = async (entryId) => {
    try {
      await deleteDoc(doc(db, "athletes", athleteId, "wellbeing", entryId));
      setHistory(prev => prev.filter(e => e.id !== entryId));
    } catch (e) {
      console.error("Delete wellbeing error:", e);
    }
    setConfirmDeleteWell(null);
  };

  const saveEntry = async (type, data, setSaving, setSaved) => {
    setSaving(true);
    const entry = {
      ...data, type,
      date: toLocalDateStr(new Date()),
      time: new Date().toTimeString().slice(0, 5),
    };
    const ref = await addDoc(collection(db, "athletes", athleteId, "wellbeing"), entry);
    setHistory(prev => [{ id: ref.id, ...entry }, ...prev].slice(0, 5));
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSaveAM = () => {
    if (!sleep || !moodAM || !sorenessAM || savingAM) return;
    saveEntry("morning", { sleep, mood: moodAM, soreness: sorenessAM }, setSavingAM, setSavedAM);
  };

  const handleSavePM = () => {
    if (!energy || !moodPM || !sorenessPM || savingPM) return;
    saveEntry("night", { energy, mood: moodPM, soreness: sorenessPM, notes: notes.trim() }, setSavingPM, setSavedPM);
  };

  const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
  const SORENESS_OPTIONS = [
    { icon: "💚", label: "None" }, { icon: "🟡", label: "Mild" },
    { icon: "🟠", label: "Mod"  }, { icon: "🔴", label: "Sore" }, { icon: "🆘", label: "Bad" },
  ];
  const ENERGY_OPTIONS = [
    { icon: "🪫", label: "Empty" }, { icon: "😴", label: "Low" },
    { icon: "😐", label: "OK"    }, { icon: "⚡", label: "Good" }, { icon: "🔥", label: "Great" },
  ];

  const moodLabel     = ["","Rough","Meh","OK","Good","Great"];
  const sorenessLabel = ["","None","Mild","Moderate","Sore","Very sore"];
  const energyLabel   = ["","Empty","Low","OK","Good","Great"];

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 20 }}>Wellbeing</div>

      {/* ── MORNING ── */}
      <div style={{ fontSize: "0.72rem", color: COLORS.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Sun size={13} /> Morning Check-in</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">🌙 Sleep last night — how many hours?</div>
        <NumGrid value={sleep} onChange={setSleep} color={COLORS.accent} />
        {sleep && <div style={{ marginTop: 8, color: COLORS.muted, fontSize: "0.82rem", textAlign: "center" }}>{sleep} hour{sleep !== 1 ? "s" : ""}</div>}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">😊 How are you feeling this morning?</div>
        <EmojiRow options={MOODS.map((icon, i) => ({ icon, label: moodLabel[i+1] }))} value={moodAM} onChange={setMoodAM} activeColor={COLORS.yellow} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="av-big-label">💪 Body soreness this morning?</div>
        <EmojiRow options={SORENESS_OPTIONS} value={sorenessAM} onChange={setSorenessAM} activeColor={COLORS.red} />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSaveAM}
        disabled={savingAM || !sleep || !moodAM || !sorenessAM}
        style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "1rem", marginBottom: 32 }}
      >
        {savingAM ? "Saving…" : savedAM ? "✓ Morning Saved!" : "Save Morning Check-in"}
      </button>

      {/* ── NIGHT ── */}
      <div style={{ fontSize: "0.72rem", color: COLORS.accentDim, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Moon size={13} /> Tonight's Check-in</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">⚡ Energy level today?</div>
        <EmojiRow options={ENERGY_OPTIONS} value={energy} onChange={setEnergy} activeColor={COLORS.yellow} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">💪 Body soreness tonight?</div>
        <EmojiRow options={SORENESS_OPTIONS} value={sorenessPM} onChange={setSorenessPM} activeColor={COLORS.red} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">😊 Mood tonight?</div>
        <EmojiRow options={MOODS.map((icon, i) => ({ icon, label: moodLabel[i+1] }))} value={moodPM} onChange={setMoodPM} activeColor={COLORS.yellow} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="av-big-label">📝 Notes <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: "0.85rem" }}>(optional)</span></div>
        <textarea
          name="wellbeingNotes"
          rows={3}
          placeholder="e.g. knee felt tight after practice, very tired…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          style={{ fontSize: "0.95rem", marginTop: 4, resize: "none" }}
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSavePM}
        disabled={savingPM || !energy || !moodPM || !sorenessPM}
        style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "1rem", marginBottom: 32, background: COLORS.accentDim }}
      >
        {savingPM ? "Saving…" : savedPM ? "✓ Tonight Saved!" : "Save Tonight's Check-in"}
      </button>

      {/* ── HISTORY ── */}
      <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Last 7 Days</div>
      {histLoading
        ? <div className="empty"><div className="spinner" /></div>
        : history.length === 0
          ? <div style={{ color: COLORS.muted, fontSize: "0.85rem", textAlign: "center", padding: "16px 0" }}>No check-ins logged yet</div>
          : history.map(entry => {
              const isConfirming = confirmDeleteWell === entry.id;
              return (
                <div key={entry.id} style={{
                  background: COLORS.card, border: `1px solid ${isConfirming ? COLORS.red : COLORS.border}`,
                  borderRadius: 10, padding: "12px 14px", marginBottom: 8,
                }}>
                  {isConfirming ? (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.88rem", color: COLORS.text, marginBottom: 12 }}>Delete this check-in?</div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteWell(null)}>Cancel</button>
                        <button className="btn btn-sm" onClick={() => handleDeleteWell(entry.id)}
                          style={{ background: COLORS.red, color: "#fff", border: "none" }}>Delete</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.text }}>{entry.date}</span>
                          <span style={{ fontSize: "0.7rem", color: COLORS.muted, background: COLORS.surface, padding: "2px 8px", borderRadius: 8 }}>
                            {entry.type === "night" ? "🌙 Tonight" : entry.type === "morning" ? "☀️ Morning" : "Check-in"}
                          </span>
                        </div>
                        <button onClick={() => setConfirmDeleteWell(entry.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4, lineHeight: 1 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: "0.78rem", color: COLORS.muted, flexWrap: "wrap" }}>
                        {entry.sleep    && <span>🌙 {entry.sleep}h sleep</span>}
                        {entry.energy   && <span>⚡ Energy {entry.energy}/5 ({energyLabel[entry.energy]})</span>}
                        {entry.mood     && <span>😊 Mood {entry.mood}/5 ({moodLabel[entry.mood]})</span>}
                        {entry.soreness && <span>💪 Soreness {entry.soreness}/5 ({sorenessLabel[entry.soreness]})</span>}
                        {entry.notes    && <span style={{ color: COLORS.text, fontStyle: "italic", width: "100%", marginTop: 2 }}>"{entry.notes}"</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })
      }
    </div>
  );
}
