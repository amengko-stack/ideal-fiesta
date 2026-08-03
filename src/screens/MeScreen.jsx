import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { levelFromXp } from "../lib/gamification.js";
import { TENNIS_GAPS } from "../lib/exerciseDb.js";
import { FITNESS_TESTS } from "../lib/fitnessTests.js";
import { growthVelocity } from "../lib/growth.js";
import { maturityOffset, stageInfo } from "../lib/maturity.js";
import { identityChipText } from "../lib/athleteIdentity.js";
import { isMetricTarget, describeTarget, describeMetricValue, matchesSince, toISO } from "../lib/priorityMetrics.js";
import { openInjuries, resolvedInjuries, describeInjury, recurringAreas } from "../lib/injuries.js";
import { practiceEvidence, focusStreakText } from "../lib/practiceFocus.js";

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

const PATTERN_STATUS_COLOR = { active: M.danger, improving: M.warn, resolved: M.success };

export default function MeScreen({ profile, xp, streak, sessionHistory, weekLogs, priorities, matches, benchmarks, technical, injuries, memory, onRemoveMemoryPattern, isParent, parentMode, onToggleParentMode, onToggleGap, onResolvePriority, onLogGrowth, onLogBenchmark, onLogStroke, onLogInjury, onEditInjury, onEditProfile, onSignOut, pushState, onToggleReminders }) {
  const firstName = (profile?.name || "Athlete").split(" ")[0];
  const lv = levelFromXp(xp);
  const gaps = profile?.gaps || [];
  const measurements = profile?.measurements || [];
  const velocity = growthVelocity(measurements);
  // measurements are stored newest-first — sort ascending so the chart reads left→right in time
  const heights = measurements.filter(m => m.height != null)
    .sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(-5);
  const maxH = Math.max(...heights.map(h => h.height), 1);
  const minH = Math.min(...heights.map(h => h.height), maxH) - 12;

  // Latest measurement that has a sitting-height reading — measurements are
  // stored newest-first, so the first match is the most recent one usable
  // for the Mirwald equation.
  const latestWithSittingHeight = measurements.find(m => m.sittingHeight != null);
  const maturity = latestWithSittingHeight
    ? maturityOffset({
        dob:             profile?.dob,
        heightCm:        latestWithSittingHeight.height ?? profile?.height,
        sittingHeightCm: latestWithSittingHeight.sittingHeight,
        weightKg:        latestWithSittingHeight.weight ?? profile?.weight,
      })
    : null;
  const maturityStageColor = { "Pre-PHV": M.parentBlue, "Mid-PHV": M.streakOrange, "Post-PHV": M.success };

  // Most recent readable value of a priority's target metric, counting only
  // matches played since it was raised. Blank when nothing measurable yet.
  const latestReading = (p) => {
    if (!isMetricTarget(p.metricTarget)) return "";
    for (const m of matchesSince(matches, toISO(p.deferredDate))) {
      const txt = describeMetricValue(m, p.metricTarget.metric);
      if (txt) return txt;
    }
    return "";
  };

  const latestBench = latestPer(benchmarks, "testName");
  const latestTech = Object.values(latestPer(technical, "strokeArea"))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const openInj = openInjuries(injuries);
  const resolvedInj = resolvedInjuries(injuries);
  const recurring = recurringAreas(injuries);
  const SEVERITY_COLOR = { 1: M.parentBlue, 2: M.parentBlue, 3: M.warn, 4: M.danger, 5: M.danger };

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
          <div style={{ fontSize: 12.5, color: M.sub, marginTop: 4 }}>{identityChipText(profile)} · Tennis + Cross-Training</div>
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
        {(priorities || []).map(p => {
          const weeks   = p.weeksDeferredCount ?? 0;
          const reading = latestReading(p);
          return (
          <div key={p.id} style={{ padding: "11px 0", borderTop: `1px solid ${M.divider}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{p.priority}</div>
              {weeks > 0 && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: M.sub, background: M.fill, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{weeks} wk{weeks === 1 ? "" : "s"}</span>
              )}
              {p.status === "escalated" && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: M.danger, background: `${M.danger}18`, padding: "2px 8px", borderRadius: 20 }}>ESCALATED</span>
              )}
            </div>
            {p.reason && <div style={{ fontSize: 11.5, color: M.sub, marginTop: 1 }}>{p.reason}</div>}
            {/* Without this the priority would just vanish one day and look like a bug. */}
            {isMetricTarget(p.metricTarget) && (
              <div style={{ fontSize: 11, color: M.muted, marginTop: 4 }}>
                🎯 Clears itself at {describeTarget(p.metricTarget)} in 2 matches
                {reading ? ` · last match ${reading}` : ""}
              </div>
            )}
            <div style={{ fontSize: 11, color: M.muted, marginTop: 4 }}>
              🎾 {focusStreakText(practiceEvidence(weekLogs, p))}
            </div>
            <div onClick={() => onResolvePriority(p.priority)} style={{
              cursor: "pointer", marginTop: 10, textAlign: "center", padding: 9, borderRadius: 11,
              background: M.gradient, color: M.deepGreen, fontFamily: M.display, fontWeight: 700, fontSize: 12.5,
            }}>✓ Resolved</div>
          </div>
          );
        })}
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
              <span onClick={onLogBenchmark} style={{ marginLeft: "auto", cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: "#5c7a0a" }}>＋ Log</span>
            </div>
            {Object.keys(latestBench).length === 0 && (
              <div onClick={onLogBenchmark} style={{ cursor: "pointer", fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No benchmarks yet — tap ＋ Log to record the first fitness test →</div>
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
              <span onClick={onLogStroke} style={{ marginLeft: "auto", cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: "#5c7a0a" }}>＋ Add</span>
            </div>
            {latestTech.length === 0 && (
              <div onClick={onLogStroke} style={{ cursor: "pointer", fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No stroke assessments yet — tap ＋ Add to write the first one →</div>
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

          {memory && (memory.narrative || memory.trajectory || (memory.persistentPatterns || []).length > 0) && (
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>What the AI knows about you 🧠</span>
                {PARENT_BADGE}
              </div>
              {memory.narrative && (
                <div style={{ fontSize: 12.5, color: M.ink, lineHeight: 1.5, marginBottom: 10 }}>{memory.narrative}</div>
              )}
              {memory.trajectory && (
                <div style={{ fontSize: 12, color: M.sub, lineHeight: 1.5, marginBottom: 10 }}>
                  <span style={{ fontWeight: 700 }}>Trajectory: </span>{memory.trajectory}
                </div>
              )}
              {(memory.persistentPatterns || []).length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", marginTop: 6, marginBottom: 6 }}>
                    Persistent patterns
                  </div>
                  {memory.persistentPatterns.map((p, i) => (
                    <div key={`${p.pattern}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 0", borderTop: `1px solid ${M.divider}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13, color: M.ink }}>{p.pattern}</span>
                          {p.status && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: PATTERN_STATUS_COLOR[p.status] || M.muted, background: `${PATTERN_STATUS_COLOR[p.status] || M.muted}18`, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase" }}>{p.status}</span>
                          )}
                        </div>
                        {p.evidence && <div style={{ fontSize: 11, color: M.sub, marginTop: 2 }}>{p.evidence}</div>}
                      </div>
                      <span
                        onClick={() => onRemoveMemoryPattern && onRemoveMemoryPattern(p.pattern)}
                        style={{ cursor: "pointer", fontSize: 11, color: M.danger, fontWeight: 700, flexShrink: 0, padding: "3px 6px" }}
                        title="Remove — if this is wrong, take it out"
                      >✕ Remove</span>
                    </div>
                  ))}
                </>
              )}
            </Card>
          )}

        </>
      )}

      {/* injuries — visible to everyone; it's Valissa's own body, same reasoning as Growth below */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Injuries & niggles 🩹</span>
          <span onClick={onLogInjury} style={{ marginLeft: "auto", cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: "#5c7a0a" }}>＋ Log</span>
        </div>
        <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 13 }}>Track what hurts so training and the AI can work around it</div>
        {openInj.length === 0 && resolvedInj.length === 0 && (
          <div onClick={onLogInjury} style={{ cursor: "pointer", fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>Nothing logged — tap ＋ Log if something's bothering you →</div>
        )}
        {openInj.map(i => (
          <div key={i.id} onClick={() => onEditInjury && onEditInjury(i)} style={{ cursor: onEditInjury ? "pointer" : "default", display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${M.divider}` }}>
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: SEVERITY_COLOR[i.severity] || M.muted,
              background: `${SEVERITY_COLOR[i.severity] || M.muted}18`, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
            }}>OPEN</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13.5, color: M.ink }}>{describeInjury(i)}</div>
              {i.notes && <div style={{ fontSize: 11, color: M.sub, marginTop: 1 }}>{i.notes}</div>}
            </div>
          </div>
        ))}
        {resolvedInj.map(i => (
          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${M.divider}` }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: M.success, background: `${M.success}18`, padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>HEALED</span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: M.sub }}>{describeInjury(i)}</div>
          </div>
        ))}
        {recurring.length > 0 && (
          <div style={{ fontSize: 11.5, color: M.warn, fontWeight: 600, marginTop: 10 }}>
            Recurring: {recurring.map(r => `${r.bodyArea} (${r.count}×)`).join(", ")}
          </div>
        )}
      </Card>

      {/* growth — visible to everyone; Valissa logs her own measurements */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Growth 🌱</span>
          <span onClick={onLogGrowth} style={{ marginLeft: "auto", cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: "#5c7a0a" }}>＋ Log</span>
        </div>
        <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 14 }}>Height over time — used to tune training load during growth spurts</div>
        {heights.length === 0 ? (
          <div onClick={onLogGrowth} style={{ cursor: "pointer", fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No measurements yet — tap ＋ Log to add height, weight & sitting height →</div>
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
            {isParent && parentMode && maturity && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${M.divider}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, color: maturityStageColor[maturity.stage] || M.muted,
                    background: `${maturityStageColor[maturity.stage] || M.muted}18`, padding: "2px 8px",
                    borderRadius: 20, textTransform: "uppercase",
                  }}>{maturity.stage}</span>
                  {PARENT_BADGE}
                  <span style={{ fontSize: 11.5, color: M.sub, fontWeight: 600 }}>
                    ≈{Math.abs(maturity.offset).toFixed(1)} yrs {maturity.offset < 0 ? "from" : "past"} peak growth
                  </span>
                </div>
                <div style={{ fontSize: 11, color: M.muted, lineHeight: 1.4 }}>
                  {stageInfo(maturity.stage)?.implication}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* settings */}
      <Card style={{ padding: "8px 16px" }}>
        {isParent && (
          <div onClick={onEditProfile} style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${M.divider}` }}>
            <div>
              <span style={{ fontSize: 13.5, color: M.ink, fontWeight: 600 }}>Edit profile</span>
              <div style={{ fontSize: 11, color: M.muted, marginTop: 1 }}>Name, birthday, schedules, coach notes</div>
            </div>
            <span style={{ fontSize: 12, color: M.muted }}>›</span>
          </div>
        )}
        {isParent && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${M.divider}` }}>
            <div>
              <span style={{ fontSize: 13.5, color: M.ink, fontWeight: 600 }}>Parent mode</span>
              <div style={{ fontSize: 11, color: M.muted, marginTop: 1 }}>Shows coach data (benchmarks, strokes, parent notes)</div>
            </div>
            <div onClick={onToggleParentMode} style={{
              cursor: "pointer", width: 42, height: 24, borderRadius: 99, position: "relative",
              background: parentMode ? M.strength : "#D6E2DB", transition: "background .15s", flexShrink: 0,
            }}>
              <div style={{ position: "absolute", top: 2, left: parentMode ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </div>
          </div>
        )}
        {(() => {
          const canToggle = pushState?.supported && pushState?.permission !== "denied";
          const on = !!(pushState?.supported && pushState?.permission === "granted" && pushState?.enabled);
          let subtitle;
          if (pushState?.supported && pushState?.permission === "granted") {
            subtitle = "Evening nudge if you haven't checked in";
          } else if (pushState?.supported && pushState?.permission === "default") {
            subtitle = "Turn on to get an evening nudge if you haven't checked in";
          } else if (pushState?.permission === "denied") {
            subtitle = "Blocked — re-enable notifications for this app in Safari/browser settings";
          } else {
            subtitle = "Add this app to your Home Screen and open it from there to turn this on (iPhone, iOS 16.4+)";
          }
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${M.divider}` }}>
              <div>
                <span style={{ fontSize: 13.5, color: M.ink, fontWeight: 600 }}>Daily reminders</span>
                <div style={{ fontSize: 11, color: M.muted, marginTop: 1 }}>{subtitle}</div>
              </div>
              <div onClick={canToggle ? onToggleReminders : undefined} style={{
                cursor: canToggle ? "pointer" : "default", width: 42, height: 24, borderRadius: 99, position: "relative",
                background: on ? M.strength : "#D6E2DB", transition: "background .15s", flexShrink: 0, opacity: canToggle ? 1 : .5,
              }}>
                <div style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
              </div>
            </div>
          );
        })()}
        <div style={{ fontSize: 11, color: M.muted, padding: "13px 0", borderBottom: `1px solid ${M.divider}` }}>
          The classic app is still available — add <b>?classic</b> to the address to open it.
        </div>
        <div onClick={onSignOut} style={{ cursor: "pointer", textAlign: "center", padding: "13px 0", fontFamily: M.display, fontWeight: 700, fontSize: 13.5, color: M.danger }}>
          Sign out
        </div>
      </Card>
    </>
  );
}
