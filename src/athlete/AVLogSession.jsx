import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { db } from "../firebase";
import {
  doc, deleteDoc, addDoc, collection, getDocs, query, orderBy, limit,
} from "firebase/firestore";
import { COLORS } from "../styles/theme.js";
import { callClaudeText } from "../lib/ai.js";
import { toLocalDateStr } from "../lib/dates.js";
import { shoutoutSystemPrompt } from "../lib/athleteIdentity.js";
import { loadMemory, pushShoutout } from "../lib/athleteMemory.js";

function TypeBtn({ t, icon, label, color, type, setType, setFocus, setSportName }) {
  return (
    <button
      onClick={() => { setType(t); setFocus(""); setSportName(""); }}
      style={{
        flex: 1, padding: "16px 6px", borderRadius: 14,
        border: `2px solid ${type === t ? color : COLORS.border}`,
        background: type === t ? `${color}14` : "transparent",
        color: type === t ? color : COLORS.muted,
        fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 700,
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>{icon}</div>
      {label}
    </button>
  );
}

// ─── AV: LOG SESSION ──────────────────────────────────────────────────────────
export default function AVLogSession({ athleteId, profile }) {
  const [type, setType]           = useState("tennis");
  const [sportName, setSportName] = useState("");
  const [duration, setDuration]   = useState("");
  const [rpe, setRpe]             = useState(null);
  const [focus, setFocus]         = useState("");
  const [date, setDate]           = useState(toLocalDateStr(new Date()));
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);

  // Motivation overlay
  const [showMotivation,    setShowMotivation]    = useState(false);
  const [motivationLoading, setMotivationLoading] = useState(false);
  const [motivationMsg,     setMotivationMsg]     = useState(null);
  const [savedEntry,        setSavedEntry]        = useState(null);

  // Delete confirmation
  const [confirmDeleteLog, setConfirmDeleteLog] = useState(null);

  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = toLocalDateStr(cutoff);
    getDocs(query(
      collection(db, "athletes", athleteId, "weekLogs"),
      orderBy("date", "desc"), limit(30)
    ))
      .then(snap => {
        const logs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(l => l.date >= cutoffStr)
          .sort((a, b) => `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`));
        setRecentLogs(logs);
      })
      .catch(() => {});
  }, [athleteId]);

  const handleDeleteLog = async (logId) => {
    try {
      await deleteDoc(doc(db, "athletes", athleteId, "weekLogs", logId));
      setRecentLogs(prev => prev.filter(l => l.id !== logId));
    } catch (e) {
      console.error("Delete log error:", e);
    }
    setConfirmDeleteLog(null);
  };

  const TENNIS_FOCUS = ["Baseline rallying", "Serve practice", "Footwork / movement", "Match play", "Volley / net", "Conditioning", "Full practice"];
  const OTHER_FOCUS  = ["Practice / Training", "Competition", "Conditioning", "Full session"];

  const handleSave = async () => {
    if (!duration || !rpe || saving) return;
    setSaving(true);
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const dayOfWeek = new Date(date + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long" });
    const entry = {
      type, duration: parseInt(duration),
      intensity: Math.ceil(rpe / 2), rpe,
      focus, date, time: now.toTimeString().slice(0, 5),
    };
    if (type === "other" && sportName.trim()) entry.sportName = sportName.trim();

    // Save to Firestore immediately
    const ref = await addDoc(collection(db, "athletes", athleteId, "weekLogs"), entry);
    setRecentLogs(prev => {
      const updated = [{ id: ref.id, ...entry }, ...prev];
      updated.sort((a, b) =>
        `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`)
      );
      return updated.slice(0, 5);
    });

    // Show overlay immediately with loading state, reset form
    setSavedEntry({ ...entry, timeOfDay, dayOfWeek });
    setMotivationMsg(null);
    setMotivationLoading(true);
    setShowMotivation(true);
    setDuration(""); setRpe(null); setFocus(""); setSportName("");
    setSaving(false);

    // Fetch motivational message in background
    const activityLabel = type === "tennis" ? "Tennis" : entry.sportName || "Other Sport";
    const userMsg = `Valissa just logged a ${activityLabel} session:\n- Duration: ${entry.duration} minutes\n- Intensity: ${entry.intensity}/5\n- Focus: ${entry.focus || "general training"}\n- Time of day: ${timeOfDay}\n- Day of week: ${dayOfWeek}\n\nWrite a motivational confirmation message specifically referencing what she just did. Make it feel personal and real.`;
    loadMemory(athleteId)
      .then(memory => callClaudeText({
        system: shoutoutSystemPrompt(profile, memory.shoutouts || []),
        userContent: userMsg,
        maxTokens: 120,
      }))
      .then(msg => {
        setMotivationMsg(msg || "Great work today — every session counts! Keep showing up. 💪");
        if (msg) pushShoutout(athleteId, msg).catch(() => { /* non-blocking */ });
      })
      .catch(() => setMotivationMsg("Great work today — every session counts! Keep showing up. 💪"))
      .finally(() => setMotivationLoading(false));
  };

  const overlayEmoji = savedEntry?.type === "tennis" ? "🎾" : savedEntry?.type === "cheer" ? "📣" : "🏃";

  return (
    <div>
      {/* Full-screen motivational overlay */}
      {showMotivation && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: COLORS.accent,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "40px 28px", textAlign: "center",
        }}>
          <div style={{ fontSize: "4.5rem", marginBottom: 28, lineHeight: 1 }}>{overlayEmoji}</div>
          {motivationLoading ? (
            <>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#003d28", marginBottom: 20 }}>
                Getting your message…
              </div>
              <div className="spinner" style={{
                width: 28, height: 28,
                border: "3px solid rgba(0,0,0,0.15)",
                borderTopColor: "#003d28",
              }} />
            </>
          ) : (
            <>
              <div style={{
                fontSize: "1.35rem", fontWeight: 700, color: "#002a1c",
                lineHeight: 1.55, marginBottom: 40, maxWidth: 340,
              }}>
                "{motivationMsg}"
              </div>
              <button
                onClick={() => setShowMotivation(false)}
                style={{
                  background: "#002a1c", color: COLORS.accent,
                  border: "none", borderRadius: 14, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                  fontSize: "1rem", padding: "16px 48px",
                }}
              >
                Done ✓
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 20 }}>Log Session</div>

      <div style={{ marginBottom: 22 }}>
        <div className="av-big-label">Activity</div>
        <div style={{ display: "flex", gap: 10 }}>
          <TypeBtn t="tennis" icon="🎾" label="Tennis"      color={COLORS.tennis} type={type} setType={setType} setFocus={setFocus} setSportName={setSportName} />
          <TypeBtn t="other"  icon="🏃" label="Other Sport"  color={COLORS.yellow} type={type} setType={setType} setFocus={setFocus} setSportName={setSportName} />
        </div>
      </div>

      {type === "other" && (
        <div style={{ marginBottom: 22 }}>
          <div className="av-big-label">Sport Name</div>
          <input
            name="sportName"
            placeholder="e.g. Swimming, Basketball…"
            value={sportName}
            onChange={e => setSportName(e.target.value)}
            style={{ fontSize: "1rem", padding: "13px 14px" }}
          />
          <div className="av-hint" style={{ marginTop: 6 }}>Counts at full weight in load calculations</div>
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <div className="av-big-label">Duration (minutes)</div>
        <input
          name="duration"
          type="number" placeholder="e.g. 90"
          value={duration} onChange={e => setDuration(e.target.value)}
          min="10" max="300"
          style={{ fontSize: "1.2rem", padding: "14px 16px" }}
        />
      </div>

      <div style={{ marginBottom: 22 }}>
        <div className="av-big-label">How hard was it? (RPE 1–10)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 10 }}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button
              key={n}
              onClick={() => setRpe(n)}
              style={{
                padding: "16px 4px", borderRadius: 10,
                border: `2px solid ${rpe === n ? COLORS.accent : COLORS.border}`,
                background: rpe === n ? COLORS.accentMuted : "transparent",
                color: rpe === n ? COLORS.accent : COLORS.muted,
                fontFamily: "'DM Sans', sans-serif", fontSize: "1.15rem", fontWeight: 700,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >{n}</button>
          ))}
        </div>
        {rpe ? (
          <div style={{
            background: COLORS.accentMuted, border: `1px solid ${COLORS.accentDim}`,
            borderRadius: 10, padding: "10px 14px", textAlign: "center",
          }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.accent }}>RPE {rpe} — </span>
            <span style={{ fontSize: "0.9rem", color: COLORS.text, fontWeight: 500 }}>
              {[,"Very easy — barely moving","Easy — could do this all day","Moderate — comfortable but working","Somewhat hard","Hard — starting to breathe heavy","Hard","Very hard — difficult to maintain","Very very hard","Almost max — can barely speak","Maximum — couldn't do more"][rpe]}
            </span>
          </div>
        ) : (
          <div style={{ background: COLORS.surface, borderRadius: 10, padding: "10px 14px" }}>
            {[
              [1,"Very easy — barely moving"],
              [2,"Easy — could do this all day"],
              [3,"Moderate — comfortable but working"],
              [4,"Somewhat hard"],
              [5,"Hard — starting to breathe heavy"],
              [6,"Hard"],
              [7,"Very hard — difficult to maintain"],
              [8,"Very very hard"],
              [9,"Almost max — can barely speak"],
              [10,"Maximum — couldn't do more"],
            ].map(([n, desc]) => (
              <div key={n} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0" }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1rem", color: COLORS.accent, minWidth: 20 }}>{n}</span>
                <span style={{ fontSize: "0.78rem", color: COLORS.muted }}>{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 22 }}>
        <div className="av-big-label">Session Focus</div>
        <select name="focus" value={focus} onChange={e => setFocus(e.target.value)} style={{ fontSize: "1rem", padding: "13px 14px" }}>
          <option value="">Select focus…</option>
          {(type === "tennis" ? TENNIS_FOCUS : OTHER_FOCUS).map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div className="av-big-label">Date</div>
        <input name="date" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: "1rem", padding: "13px 14px" }} />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving || !duration || !rpe}
        style={{ width: "100%", justifyContent: "center", padding: "18px", fontSize: "1rem" }}
      >
        {saving ? "Saving…" : "Save Session"}
      </button>

      {recentLogs.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Last 7 Days</div>
          {recentLogs.map(log => {
            const typeColor = log.type === "tennis" ? COLORS.tennis : log.type === "cheer" ? COLORS.cheer : COLORS.yellow;
            const typeLabel = log.type === "tennis" ? "🎾 Tennis" : log.type === "cheer" ? "📣 Cheer" : `🏃 ${log.sportName || "Other"}`;
            const rpeVal = log.rpe ?? (log.intensity ? log.intensity * 2 : "?");
            const isConfirming = confirmDeleteLog === log.id;
            return (
              <div key={log.id} style={{
                background: COLORS.card, border: `1px solid ${isConfirming ? COLORS.red : COLORS.border}`,
                borderRadius: 12, padding: "12px 14px", marginBottom: 8,
              }}>
                {isConfirming ? (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "0.88rem", color: COLORS.text, marginBottom: 12 }}>Delete this session?</div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteLog(null)}>Cancel</button>
                      <button className="btn btn-sm" onClick={() => handleDeleteLog(log.id)}
                        style={{ background: COLORS.red, color: "#fff", border: "none" }}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: "0.9rem", color: typeColor }}>{typeLabel}</span>
                      {log.focus && <span style={{ color: COLORS.muted, fontSize: "0.8rem", marginLeft: 8 }}>{log.focus}</span>}
                      <div style={{ color: COLORS.muted, fontSize: "0.72rem", marginTop: 3 }}>{log.date} · {log.duration} min</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem", color: COLORS.accent }}>RPE {rpeVal}</div>
                      <button onClick={() => setConfirmDeleteLog(log.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4, lineHeight: 1 }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
