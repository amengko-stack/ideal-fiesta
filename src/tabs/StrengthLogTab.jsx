import { useState, useEffect } from "react";
import { Dumbbell } from "lucide-react";
import { toLocalDateStr } from "../lib/dates.js";
import { COLORS } from "../styles/theme.js";

// ─── STRENGTH LOG TAB ─────────────────────────────────────────────────────────
export default function StrengthLogTab({ sessionHistory, addSession, planResult }) {
  const [logExercises, setLogExercises]   = useState([]);
  const [sessionDate, setSessionDate]     = useState(toLocalDateStr(new Date()));
  const [sessionTimeLog, setSessionTimeLog] = useState(new Date().toTimeString().slice(0, 5));
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);

  useEffect(() => {
    if (planResult?.plan && logExercises.length === 0) {
      setLogExercises(planResult.plan.map(ex => ({
        id: ex.id, name: ex.name,
        sets: ex.sets || 2, reps: ex.reps || 10,
        weight: "", difficulty: 3, completed: true, notes: ""
      })));
    }
  }, [planResult]);

  const addExercise = () => {
    setLogExercises(prev => [...prev, {
      id: `custom_${Date.now()}`, name: "", sets: 2, reps: 10,
      weight: "", difficulty: 3, completed: true, notes: ""
    }]);
  };

  const updateEx = (idx, field, val) => {
    setLogExercises(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
  };

  const handleSave = async () => {
    setSaving(true);
    await addSession({
      date: sessionDate,
      time: sessionTimeLog,
      exercises: logExercises.filter(e => e.name),
    });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="card">
        <div className="card-title"><Dumbbell size={18} /> Log Strength Session</div>
        <div className="grid2">
          <div>
            <div className="label">Date</div>
            <input name="sessionDate" type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
          </div>
          <div>
            <div className="label">Session Time</div>
            <input name="sessionTimeLog" type="time" value={sessionTimeLog} onChange={e => setSessionTimeLog(e.target.value)} />
          </div>
        </div>
        {planResult && <div className="note-box mt16">✓ Pre-filled from today's generated plan. Adjust as needed.</div>}
      </div>

      {logExercises.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "28px 20px" }}>
          <Dumbbell size={32} color={COLORS.muted} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>No exercises yet</div>
          <div style={{ color: COLORS.muted, fontSize: "0.82rem", marginBottom: 18 }}>
            Add your first exercise to get started
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {["Squats", "Lunges", "Push-ups", "Plank"].map(name => (
              <button
                key={name}
                className="btn btn-ghost btn-sm"
                onClick={() => setLogExercises(prev => [...prev, {
                  id: `custom_${Date.now()}_${name}`, name,
                  sets: 2, reps: 10, weight: "", difficulty: 3, completed: true, notes: ""
                }])}
                style={{ borderRadius: 20, padding: "6px 14px", fontSize: "0.82rem" }}
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {logExercises.map((ex, idx) => (
        <div key={idx} className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>
              {ex.name
                ? ex.name
                : <input name="exerciseName" placeholder="Exercise name…" value={ex.name} onChange={e => updateEx(idx, "name", e.target.value)} style={{ fontWeight: 600 }} />
              }
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => setLogExercises(prev => prev.filter((_, i) => i !== idx))}>✕</button>
          </div>
          <div className="grid2">
            <div>
              <div className="label">Sets Done</div>
              <input name="sets" type="number" value={ex.sets} onChange={e => updateEx(idx, "sets", e.target.value)} min="1" max="8" />
            </div>
            <div>
              <div className="label">Reps Done</div>
              <input name="reps" type="number" value={ex.reps} onChange={e => updateEx(idx, "reps", e.target.value)} min="1" max="50" />
            </div>
            <div>
              <div className="label">Weight (kg, optional)</div>
              <input name="exerciseWeight" placeholder="e.g. 4kg or bodyweight" value={ex.weight} onChange={e => updateEx(idx, "weight", e.target.value)} />
            </div>
            <div>
              <div className="label">Completed all sets?</div>
              <select name="completed" value={ex.completed ? "yes" : "no"} onChange={e => updateEx(idx, "completed", e.target.value === "yes")}>
                <option value="yes">✅ Yes, completed</option>
                <option value="no">⚠️ No, stopped early</option>
              </select>
            </div>
          </div>
          <div className="mt16">
            <div className="label">Difficulty</div>
            <div className="star-row mt8">
              {[1,2,3,4,5].map(n => (
                <span key={n} className={`star ${ex.difficulty >= n ? "lit" : ""}`} onClick={() => updateEx(idx, "difficulty", n)}>
                  {ex.difficulty >= n ? "⭐" : "○"}
                </span>
              ))}
              <span style={{ color: COLORS.muted, fontSize: "0.8rem", marginLeft: 6 }}>
                {["","Very easy","Easy","Just right","Hard","Max effort"][ex.difficulty]}
              </span>
            </div>
          </div>
        </div>
      ))}

      <div className="flex" style={{ gap: 10, marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={addExercise} style={{ flex: 1, justifyContent: "center" }}>+ Add Exercise</button>
      </div>
      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={{ width: "100%", justifyContent: "center", padding: "13px" }}
      >
        {saving ? "Saving…" : saved ? "✓ Session Saved!" : "Save Strength Session"}
      </button>
    </div>
  );
}
