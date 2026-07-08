import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { levelFromXp } from "../lib/gamification.js";
import { TENNIS_GAPS } from "../lib/exerciseDb.js";
import { FITNESS_TESTS } from "../lib/fitnessTests.js";
import { growthVelocity } from "../lib/growth.js";

const secTitle = { fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 12 };
const PARENT_BADGE = (
  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.parentBlue, background: M.parentBlueBg, padding: "3px 8px", borderRadius: 20 }}>PARENT</span>
);
const PRIORITY_COLOR = { High: M.danger, Medium: M.warn, Monitor: M.parentBlue };

const latestPer = (rows, key) => {
  const map = {};
  for (const r of rows || []) {
    if (!map[r[key]] || (r.date || "") > (map[r[key]].date || "")) map[r[key]] = r;
  }
  return map;
};
const previousFor = (rows, key, latest) =>
  (rows || []).filter(r => r[key] === latest[key] && r.id !== latest.id && (r.date || "") <= (latest.date || ""))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || null;

export default function MeScreen({ profile, xp, streak, sessionHistory, priorities, benchmarks, technical, isParent, parentMode, onToggleParentMode, onToggleGap, onResolvePriority, onSignOut }) {
  const firstName = (profile?.name || "Athlete").split(" ")[0];
  const age = profile?.dob ? Math.floor((new Date() - new Date(`${profile.dob}T00:00:00`)) / (365.25 * 86400000)) : null;
  const lv = levelFromXp(xp);
  const gaps = profile?.gaps || [];
  const measurements = profile?.measurements || [];
  const velocity = growthVelocity(measurements);
  // measurements are stored newest-first — sort ascending so the chart reads left→right in time
  const heights = measurements.filter(m => m.height != null)
    .sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(-5);
  const maxH = Math.max(...heights.map(h => h.height), 1);
  const minH = Math.min(...heights.map(h => h.height), maxH) - 12;

  const latestBench = latestPer(benchmarks, "testName");
  const latestTech = Object.values(latestPer(technical, "strokeArea"))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <>
      {/* profile */}
      <Card style={{ borderRadius: 24, padding: 20, display: "flex", alignItems: "center", gap: 15, boxShadow: M.dropLg }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: M.gradient, display: "flex",
          alignItems: "center", justifyContent: "center", fontFamily: M.display, fontWeight: 700,
          fontSize: 28, color: M.deepGreen, boxShadow: `0 4px 0 ${M.brandShadow}`,
        }}>{firstName.charAt(0).toUpperCase() || "A"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink, lineHeight: 1 }}>{firstName}</div>
          <div style={{ fontSize: 12.5, color: M.sub, marginTop: 4 }}>{age != null ? `Age ${age} · ` : ""}Tennis + Cross-Training</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 11, color: M.deepGreen, background: M.gradient, padding: "3px 10px", borderRadius: 10 }}>Lvl {lv.level}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: M.streakOrange, background: "#FFF1DD", padding: "3px 10px", borderRadius: 10 }}>🔥 {streak} days</span>
          </div>
        </div>
      </Card>

      {/* focus areas */}
      <Card>
        <div style={{ ...secTitle, marginBottom: 4 }}>Tennis focus areas</div>
        <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 13 }}>Tap to choose what the Sunday plans work on</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TENNIS_GAPS.map(g => {
            const sel = gaps.includes(g.id);
            return (
              <div key={g.id} onClick={() => onToggleGap(g.id)} style={{
                cursor: "pointer", padding: "7px 13px", borderRadius: 20, fontFamily: M.display,
                fontWeight: 700, fontSize: 12,
                border: sel ? "1.5px solid transparent" : "1.5px solid #D6E2DB",
                background: sel ? M.gradient : M.card, color: sel ? M.deepGreen : M.muted,
              }}>{g.label}</div>
            );
          })}
        </div>
      </Card>

      {/* priorities */}
      <Card>
        <div style={secTitle}>Focus priorities 🎯</div>
        {(!priorities || priorities.length === 0) && (
          <div style={{ textAlign: "center", padding: "14px 0", fontSize: 13, color: M.sub }}>All caught up — great work! 🎉</div>
        )}
        {(priorities || []).map(p => (
          <div key={p.id} style={{ padding: "11px 0", borderTop: `1px solid ${M.divider}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{p.priority}</div>
              {p.status === "escalated" && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: M.danger, background: `${M.danger}18`, padding: "2px 8px", borderRadius: 20 }}>ESCALATED</span>
              )}
            </div>
            {p.reason && <div style={{ fontSize: 11.5, color: M.sub, marginTop: 1 }}>{p.reason}</div>}
            <div onClick={() => onResolvePriority(p.priority)} style={{
              cursor: "pointer", marginTop: 10, textAlign: "center", padding: 9, borderRadius: 11,
              background: M.gradient, color: M.deepGreen, fontFamily: M.display, fontWeight: 700, fontSize: 12.5,
            }}>✓ Resolved</div>
          </div>
        ))}
      </Card>

      {/* progress */}
      <Card>
        <div style={secTitle}>Progress 📈</div>
        <div style={{ display: "flex", gap: 11 }}>
          {[
            { val: (sessionHistory || []).length, label: "strength sessions", color: M.success },
            { val: streak, label: "day streak", color: M.streakOrange },
            { val: (profile?.gaps || []).length, label: "focus areas", color: M.ink },
          ].map(t => (
            <div key={t.label} style={{ flex: 1, background: M.fill, borderRadius: 14, padding: 12 }}>
              <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: t.color }}>{t.val}</div>
              <div style={{ fontSize: 10.5, color: M.sub, fontWeight: 600 }}>{t.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* parent-gated coach section */}
      {isParent && parentMode && (
        <>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Fitness benchmarks</span>
              {PARENT_BADGE}
            </div>
            {Object.keys(latestBench).length === 0 && (
              <div style={{ fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No benchmarks logged yet — use the classic app to record fitness tests.</div>
            )}
            {FITNESS_TESTS.filter(t => latestBench[t.name]).map(t => {
              const latest = latestBench[t.name];
              const prev = previousFor(benchmarks, "testName", latest);
              let trend = null;
              if (prev && prev.result !== latest.result) {
                const improved = t.lowerIsBetter ? latest.result < prev.result : latest.result > prev.result;
                trend = { txt: `${latest.result > prev.result ? "▲" : "▼"} ${Math.abs(latest.result - prev.result).toFixed(1)}`, color: improved ? M.success : M.warn };
              }
              return (
                <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: `1px solid ${M.divider}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13.5, color: M.ink }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: M.muted }}>{latest.date}</div>
                  </div>
                  <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>{latest.result} {latest.unit}</span>
                  {trend && <span style={{ fontSize: 11.5, fontWeight: 700, color: trend.color, width: 52, textAlign: "right", flexShrink: 0 }}>{trend.txt}</span>}
                </div>
              );
            })}
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Technical · strokes</span>
              {PARENT_BADGE}
            </div>
            {latestTech.length === 0 && (
              <div style={{ fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No stroke assessments yet — log them in the classic app.</div>
            )}
            {latestTech.map(a => (
              <div key={a.id} style={{ padding: "10px 0", borderTop: `1px solid ${M.divider}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13.5, color: M.ink }}>{a.strokeArea}</span>
                  {a.priority && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: PRIORITY_COLOR[a.priority] || M.muted, background: `${PRIORITY_COLOR[a.priority] || M.muted}18`, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase" }}>{a.priority}</span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: M.muted }}>{a.date}</span>
                </div>
                {a.assessment && <div style={{ fontSize: 11.5, color: M.sub, marginTop: 3, lineHeight: 1.45 }}>{a.assessment.slice(0, 140)}{a.assessment.length > 140 ? "…" : ""}</div>}
              </div>
            ))}
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Growth</span>
              {PARENT_BADGE}
            </div>
            <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 14 }}>Height over time — used to tune training load during growth spurts</div>
            {heights.length === 0 ? (
              <div style={{ fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No measurements yet — Valissa can log them in her Growth tab (classic app).</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 9, height: 74 }}>
                  {heights.map((h, i) => (
                    <div key={h.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                      <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 10, color: "#5f7168" }}>{h.height}</span>
                      <div style={{
                        width: "100%", height: `${Math.max(14, Math.round(((h.height - minH) / Math.max(maxH - minH, 1)) * 100))}%`,
                        borderRadius: "7px 7px 3px 3px",
                        background: i === heights.length - 1 ? `linear-gradient(180deg,${M.match},${M.streakOrange})` : "#DCEAE0",
                      }} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: M.muted }}>{h.date.slice(2, 7)}</span>
                    </div>
                  ))}
                </div>
                {velocity != null && (
                  <div style={{ fontSize: 11.5, color: M.sub, fontWeight: 600, marginTop: 10, textAlign: "center" }}>
                    Growing ~<span style={{ color: M.streakOrange, fontWeight: 700 }}>{velocity} cm/year</span>
                    {velocity >= 5.5 ? " — growth-spurt window: plans keep loads moderate 🌱" : ""}
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}

      {/* settings */}
      <Card style={{ padding: "8px 16px" }}>
        {isParent && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${M.divider}` }}>
            <div>
              <span style={{ fontSize: 13.5, color: M.ink, fontWeight: 600 }}>Parent mode</span>
              <div style={{ fontSize: 11, color: M.muted, marginTop: 1 }}>Shows coach data (benchmarks, strokes, growth)</div>
            </div>
            <div onClick={onToggleParentMode} style={{
              cursor: "pointer", width: 42, height: 24, borderRadius: 99, position: "relative",
              background: parentMode ? M.strength : "#D6E2DB", transition: "background .15s", flexShrink: 0,
            }}>
              <div style={{ position: "absolute", top: 2, left: parentMode ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: M.muted, padding: "13px 0", borderBottom: `1px solid ${M.divider}` }}>
          Coach tools (logging benchmarks & stroke notes) live in the classic app — add <b>?newui=0</b> to the address to open it.
        </div>
        <div onClick={onSignOut} style={{ cursor: "pointer", textAlign: "center", padding: "13px 0", fontFamily: M.display, fontWeight: 700, fontSize: 13.5, color: M.danger }}>
          Sign out
        </div>
      </Card>
    </>
  );
}
