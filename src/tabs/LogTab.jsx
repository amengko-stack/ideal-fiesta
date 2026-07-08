import { useState } from "react";
import { Calendar, Plus } from "lucide-react";
import { getWeekBounds } from "../lib/dates.js";
import { COLORS } from "../styles/theme.js";

// ─── LOG ACTIVITY TAB ─────────────────────────────────────────────────────────
export default function LogTab({ weekLogs, addWeekLog, deleteWeekLog }) {
  const [type, setType]         = useState("tennis");
  const [sportName, setSportName] = useState("");
  const [duration, setDuration] = useState("");
  const [rpe, setRpe]           = useState(null);
  const [focus, setFocus]       = useState("");
  const [date, setDate]         = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime]         = useState(new Date().toTimeString().slice(0, 5));
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const TENNIS_FOCUS = ["Baseline rallying", "Serve practice", "Footwork / movement", "Match play", "Volley / net", "Conditioning", "Full practice"];
  const OTHER_FOCUS  = ["Practice / Training", "Competition", "Conditioning", "Full session"];

  const handleLog = async () => {
    if (!duration || !rpe || saving) return;
    setSaving(true);
    const entry = { type, duration: parseInt(duration), rpe, intensity: Math.ceil(rpe / 2), focus, date, time };
    if (type === "other" && sportName.trim()) entry.sportName = sportName.trim();
    await addWeekLog(entry);
    setSaved(true);
    setDuration(""); setFocus(""); setRpe(null); setSportName("");
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const { start: thisWeekStart } = getWeekBounds(0);
  const thisWeek = weekLogs.filter(l => l.date >= thisWeekStart);

  return (
    <div>
      <div className="card">
        <div className="card-title"><Plus size={18} /> Log Activity</div>
        <div className="grid2">
          <div>
            <div className="label">Activity Type</div>
            <select name="activityType" value={type} onChange={e => { setType(e.target.value); setFocus(""); setSportName(""); }}>
              <option value="tennis">🎾 Tennis</option>
              <option value="other">🏃 Other Sport</option>
            </select>
          </div>
          <div>
            <div className="label">Date</div>
            <input name="activityDate" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <div className="label">Duration (minutes)</div>
            <input name="duration" type="number" placeholder="e.g. 90" value={duration} onChange={e => setDuration(e.target.value)} min="10" max="300" />
          </div>
          <div>
            <div className="label">Time of Day</div>
            <input name="activityTime" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        {type === "other" && (
          <div className="mt16">
            <div className="label">Sport Name</div>
            <input
              name="sportName"
              placeholder="e.g. Swimming, Basketball, Dance…"
              value={sportName}
              onChange={e => setSportName(e.target.value)}
            />
            <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>
              Counts at full weight in load calculations.
            </div>
          </div>
        )}

        <div className="mt16">
          <div className="label" style={{ marginBottom: 10 }}>
            RPE (how hard? 1–10)
            {rpe && <span style={{ marginLeft: 8, color: COLORS.accent, fontWeight: 700 }}>
              {rpe} — {["","Very easy","Easy","Moderate","Somewhat hard","Hard","Hard","Very hard","Very hard","Almost max","Max"][rpe]}
            </span>}
          </div>
          <style>{`
            .rpe-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 3px; outline: none; cursor: pointer; background: linear-gradient(to right, ${COLORS.accent} 0%, ${COLORS.accent} ${rpe ? (rpe - 1) / 9 * 100 : 0}%, ${COLORS.border} ${rpe ? (rpe - 1) / 9 * 100 : 0}%, ${COLORS.border} 100%); }
            .rpe-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: ${rpe ? COLORS.accent : COLORS.muted}; border: 3px solid ${COLORS.bg}; box-shadow: 0 0 0 2px ${rpe ? COLORS.accent : COLORS.border}; cursor: pointer; transition: background 0.15s, box-shadow 0.15s; }
            .rpe-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: ${rpe ? COLORS.accent : COLORS.muted}; border: 3px solid ${COLORS.bg}; box-shadow: 0 0 0 2px ${rpe ? COLORS.accent : COLORS.border}; cursor: pointer; }
          `}</style>
          <input
            name="rpe"
            type="range" min="1" max="10" step="1"
            value={rpe || 1}
            onChange={e => setRpe(parseInt(e.target.value))}
            className="rpe-slider"
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {[
              { val: 1,  label: "Very Easy" },
              { val: 5,  label: "Moderate"  },
              { val: 10, label: "Max Effort" },
            ].map(({ val, label }) => (
              <div key={val} style={{ textAlign: val === 5 ? "center" : val === 1 ? "left" : "right" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: rpe === val ? COLORS.accent : COLORS.muted }}>{val}</div>
                <div style={{ fontSize: "0.66rem", color: rpe === val ? COLORS.accent : COLORS.muted }}>{label}</div>
              </div>
            ))}
          </div>
          {!rpe && <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginTop: 6 }}>Drag to set intensity</div>}
        </div>

        <div className="mt16">
          <div className="label">Session Focus</div>
          <select name="focus" value={focus} onChange={e => setFocus(e.target.value)}>
            <option value="">Select focus…</option>
            {(type === "tennis" ? TENNIS_FOCUS : OTHER_FOCUS).map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-primary mt16"
          onClick={handleLog}
          disabled={saving || !duration || !rpe}
          style={{ width: "100%", justifyContent: "center", padding: "12px" }}
        >
          {saving ? "Saving…" : saved ? "✓ Logged!" : "Save Session"}
        </button>
      </div>

      <div className="card">
        <div className="card-title"><Calendar size={18} /> This Week's Activity</div>
        {thisWeek.length === 0
          ? <div className="empty">No sessions logged this week yet</div>
          : [...thisWeek].sort((a,b) => new Date(b.date)-new Date(a.date)).map(log => {
              const pillClass = log.type === "tennis" ? "pill-tennis" : log.type === "cheer" ? "pill-cheer" : "pill-other";
              const typeLabel = log.type === "tennis" ? "🎾 Tennis" : log.type === "cheer" ? "📣 Cheer" : `🏃 ${log.sportName || "Other"}`;
              const rpeDisplay = log.rpe != null ? log.rpe : (log.intensity ? log.intensity * 2 : "?");
              return (
                <div key={log.id} className="log-item">
                  <div>
                    <span className={`pill ${pillClass}`}>{typeLabel}</span>
                    <span style={{ marginLeft: 8, fontSize: "0.85rem" }}>{log.focus || "Session"}</span>
                    <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>{log.date} · {log.time} · {log.duration}min · RPE {rpeDisplay}/10</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteWeekLog(log.id)}>✕</button>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}
