import { useState } from "react";
import { Activity, BarChart2, History } from "lucide-react";
import { getWeekBounds } from "../lib/dates.js";
import { COLORS } from "../styles/theme.js";

const Trend = ({ current, previous, unit = "" }) => {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (diff === 0) return <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginTop: 3 }}>→ same as last week</div>;
  const up = diff > 0;
  const label = unit === "h"
    ? `${up ? "+" : ""}${Math.round(diff / 60)}h`
    : `${up ? "+" : ""}${diff}`;
  return (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: up ? COLORS.accent : COLORS.red, marginTop: 3 }}>
      {up ? "↑" : "↓"} {label} vs last week
    </div>
  );
};

// ─── PROGRESS TAB ────────────────────────────────────────────────────────────
export default function ProgressTab({ sessionHistory, weekLogs }) {
  const [selected, setSelected] = useState(null);

  const exMap = {};
  sessionHistory.forEach(session => {
    (session.exercises || []).forEach(ex => {
      if (!exMap[ex.id]) exMap[ex.id] = { name: ex.name, entries: [] };
      exMap[ex.id].entries.push({
        date: session.date, sets: ex.sets, reps: ex.reps,
        weight: ex.weight, difficulty: ex.difficulty, completed: ex.completed,
      });
    });
  });

  const exIds = Object.keys(exMap);
  const totalSessions  = sessionHistory.length;
  const totalTennisMin = weekLogs.filter(l => l.type === "tennis").reduce((a, l) => a + l.duration, 0);
  const totalCheerMin  = weekLogs.filter(l => l.type === "cheer").reduce((a, l) => a + l.duration, 0);
  const totalOtherMin  = weekLogs.filter(l => l.type === "other").reduce((a, l) => a + l.duration, 0);

  // Week-over-week trend calculations
  const { start: thisWeekStart, end: thisWeekEnd } = getWeekBounds(0);
  const { start: lastWeekStart, end: lastWeekEnd } = getWeekBounds(1);

  const thisWeekSessions = sessionHistory.filter(s => s.date >= thisWeekStart && s.date < thisWeekEnd).length;
  const lastWeekSessions = sessionHistory.filter(s => s.date >= lastWeekStart && s.date < lastWeekEnd).length;

  const thisWeekTennis = weekLogs.filter(l => l.type === "tennis" && l.date >= thisWeekStart && l.date < thisWeekEnd).reduce((a, l) => a + l.duration, 0);
  const lastWeekTennis = weekLogs.filter(l => l.type === "tennis" && l.date >= lastWeekStart && l.date < lastWeekEnd).reduce((a, l) => a + l.duration, 0);

  const thisWeekCheer  = weekLogs.filter(l => l.type === "cheer"  && l.date >= thisWeekStart && l.date < thisWeekEnd).reduce((a, l) => a + l.duration, 0);
  const lastWeekCheer  = weekLogs.filter(l => l.type === "cheer"  && l.date >= lastWeekStart && l.date < lastWeekEnd).reduce((a, l) => a + l.duration, 0);

  const thisWeekOther  = weekLogs.filter(l => l.type === "other"  && l.date >= thisWeekStart && l.date < thisWeekEnd).reduce((a, l) => a + l.duration, 0);
  const lastWeekOther  = weekLogs.filter(l => l.type === "other"  && l.date >= lastWeekStart && l.date < lastWeekEnd).reduce((a, l) => a + l.duration, 0);

  return (
    <div>
      <div className="card">
        <div className="card-title"><BarChart2 size={18} /> Overview</div>
        <div className="grid2">
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.accent }}>{totalSessions}</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Strength Sessions</div>
            <Trend current={thisWeekSessions} previous={lastWeekSessions} />
          </div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.tennis }}>{Math.round(totalTennisMin / 60)}h</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Tennis Logged</div>
            <Trend current={thisWeekTennis} previous={lastWeekTennis} unit="h" />
          </div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.cheer }}>{Math.round(totalCheerMin / 60)}h</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Cheer Logged</div>
            <Trend current={thisWeekCheer} previous={lastWeekCheer} unit="h" />
          </div>
          {totalOtherMin > 0 && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.yellow }}>{Math.round(totalOtherMin / 60)}h</div>
              <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Other Sports</div>
              <Trend current={thisWeekOther} previous={lastWeekOther} unit="h" />
            </div>
          )}
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.yellow }}>{exIds.length}</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Exercises Tracked</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Activity size={18} /> Exercise Progression</div>
        {exIds.length === 0
          ? <div className="empty">Log strength sessions to see progression data</div>
          : (
            <>
              <div className="label">Select Exercise</div>
              <select name="exerciseSelect" value={selected || ""} onChange={e => setSelected(e.target.value)} style={{ marginTop: 6 }}>
                <option value="">Choose exercise…</option>
                {exIds.map(id => <option key={id} value={id}>{exMap[id].name}</option>)}
              </select>

              {selected && exMap[selected] && (
                <div style={{ marginTop: 16 }}>
                  <table className="prog-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Sets × Reps</th>
                        <th>Weight</th>
                        <th>Difficulty</th>
                        <th>Done?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...exMap[selected].entries].sort((a,b) => new Date(b.date)-new Date(a.date)).map((e, i) => (
                        <tr key={i}>
                          <td style={{ color: COLORS.muted }}>{e.date}</td>
                          <td><strong>{e.sets}×{e.reps}</strong></td>
                          <td style={{ color: COLORS.muted }}>{e.weight || "—"}</td>
                          <td>{"⭐".repeat(e.difficulty || 0)}</td>
                          <td>{e.completed ? <span style={{color:COLORS.accent}}>✓</span> : <span style={{color:COLORS.red}}>✗</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        }
      </div>

      <div className="card">
        <div className="card-title"><History size={18} /> Session History</div>
        {sessionHistory.length === 0
          ? <div className="empty">No strength sessions logged yet</div>
          : [...sessionHistory].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0, 10).map(s => (
              <div key={s.id} className="log-item">
                <div>
                  <span className="pill pill-strength">💪 Strength</span>
                  <span style={{ marginLeft: 8, fontSize: "0.85rem" }}>{s.exercises?.length || 0} exercises</span>
                  <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>{s.date} · {s.time}</div>
                </div>
                <div style={{ color: COLORS.accent, fontSize: "0.8rem" }}>
                  {s.exercises?.map(e => e.name).slice(0,3).join(", ")}{s.exercises?.length > 3 ? "…" : ""}
                </div>
              </div>
            ))
        }
      </div>
    </div>
  );
}
