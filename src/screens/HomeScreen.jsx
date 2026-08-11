import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { computeLoad, readinessScore, acwrStatus, mergeWellbeingByDate } from "../lib/load.js";
import { levelFromXp, XP_PER_LEVEL } from "../lib/gamification.js";
import { toLocalDateStr, isDigestFresh } from "../lib/dates.js";
import { BADGES } from "../lib/badges.js";
import { openInjuries, injuryLoadFlag, injuryDuration } from "../lib/injuries.js";
import { weeklyFocus, focusPracticeSuggestion, practiceEvidence, focusStreakText } from "../lib/practiceFocus.js";
import { GUARDIAN_ENGINE_VERSION } from "../lib/guardianCore.js";

const SPORT = {
  tennis:   { label: "Tennis",   color: M.tennisLight },
  match:    { label: "Match",    color: M.match },
  strength: { label: "Strength", color: M.strength },
  cheer:    { label: "Cheer",    color: M.cheer },
  other:    { label: "Other",    color: M.other },
};

const ALERT_TONE = (tone) => tone === "danger" ? M.danger : tone === "warn" ? M.warn : M.parentBlue;

// "2026-07-06" → "Jul 6". Parsed at local midnight like everything else here,
// never through toISOString.
const shortDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? dateStr
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ─── WEEKLY REVIEW DIGEST ────────────────────────────────────────────────────
// What the Sunday orchestrator wrote to athletes/{id}/digests/{weekKey}. Renders
// nothing at all unless there's a digest from this week or last — an older one
// is history, and a stale summary is worse than none.
//
// Every number is read straight off the digest rather than recomputed: the whole
// point of digestCore.buildDigestData is that the card and the note the AI wrote
// can never disagree about the same week.
function WeeklyDigestCard({ digest, showParentNotes, onOpenPlan }) {
  if (!digest || !isDigestFresh(digest.weekKey, new Date())) return null;

  const load = digest.load || {};
  const status = load.acwrStatus || { label: "No data", tone: "muted" };
  const wins = (digest.matches || []).filter(m => m.won).length;
  const losses = (digest.matches || []).length - wins;
  // The athlete gets the note written to her; the parent gets the coach's one.
  // Same audience split MatchesScreen / MatchDetailSheet use for parent notes.
  const note = showParentNotes ? digest.parentNote : digest.athleteNote;
  const escalated = digest.priorities?.escalatedThisRun || [];

  const stats = [
    { val: load.thisWeekSRPE == null ? "—" : Math.round(load.thisWeekSRPE).toLocaleString(), label: "load", color: M.ink },
    { val: load.acwr == null ? "—" : load.acwr.toFixed(2), label: status.label, color: M.tone[status.tone] || M.muted },
    { val: digest.wellbeing?.checkinCount ?? 0, label: "check-ins", color: M.success },
    ...((digest.matches || []).length > 0
      ? [{ val: `${wins}-${losses}`, label: losses === 0 ? "unbeaten" : "W-L", color: M.match }]
      : []),
  ];

  return (
    <Card style={{ borderRadius: 22, padding: 17, cursor: "pointer" }}>
      <div onClick={onOpenPlan}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 16 }}>🗞️</span>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>Weekly review</span>
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: "#5c7a0a" }}>see the plan →</span>
        </div>
        <div style={{ fontSize: 11.5, color: M.sub, fontWeight: 600, marginBottom: 12 }}>
          {shortDate(digest.weekStart)} – {shortDate(digest.weekEnd)}
        </div>

        <div style={{ display: "flex", marginBottom: note || escalated.length > 0 ? 12 : 0 }}>
          {stats.map((s, i) => (
            <div key={s.label} style={{ flex: 1, textAlign: "center", borderLeft: i ? `1px solid ${M.dividerAlt}` : "none" }}>
              <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 20, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: s.color === M.ink || s.color === M.success || s.color === M.match ? M.sub : s.color, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* No paragraph when the notes call failed — the stats above still stand on their own. */}
        {note && (
          <div style={{ fontSize: 12.5, color: "#4a5a52", lineHeight: 1.5 }}>{note}</div>
        )}

        {escalated.length > 0 && (
          <div style={{ fontSize: 11.5, color: M.warn, fontWeight: 600, marginTop: note ? 10 : 0 }}>
            ⚠ Escalated this week: {escalated.join(", ")}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── LOAD & HEALTH GUARDIAN ──────────────────────────────────────────────────
// The daily agent's alert doc: athletes/{id}/guardianAlerts/{alertId}. It only
// exists at all when signals from two different families stacked up, so the
// card is rare by construction — but it is still the loudest thing on Home
// when it appears, which is why the audience split below is not cosmetic.
//
// PARENT sees the candid assessment: tone border, headline, the evidence each
// counting factor found, the AI's note, and which families made it fire.
// ATHLETE sees a neutral, risk-free game plan — no colour, no factors, no
// numbers, no severity. She is 12; a red card about her body is the harm this
// feature exists to avoid. The two branches share no styling on purpose.

// Family ids → words a parent would actually use. Presentational only: the
// engine's own wording lives in factors[].evidence, which this never rewrites.
const GUARDIAN_FAMILY_WORDS = {
  load:      "training load",
  recovery:  "how she's recovering",
  tissue:    "a sore spot that's still open",
  growth:    "growth phase",
  asymmetry: "left/right imbalance",
};

function GuardianCard({ alert, showParentNotes, onDismissGuardian }) {
  // Fail closed on a schema bump: a v2 alert rendered by a v1 card is garbage
  // dressed up as an assessment, which is worse than showing nothing.
  if (!alert || alert.dismissedAt || alert.resolvedAt) return null;
  if (alert.engineVersion !== GUARDIAN_ENGINE_VERSION) return null;

  const dismiss = (
    <div
      onClick={() => onDismissGuardian?.(alert.alertId)}
      style={{ cursor: "pointer", color: M.muted, fontSize: 16, lineHeight: 1, flexShrink: 0, padding: "0 2px" }}
    >×</div>
  );

  // ── athlete: the softened version, and structurally incapable of showing
  // risk framing — actions.athlete is written deterministically, so even when
  // the notes call failed there is something warm and useful here.
  if (!showParentNotes) {
    const note = alert.notesError ? null : alert.athleteNote;
    const actions = alert.actions?.athlete || [];
    if (!note && actions.length === 0) return null;

    return (
      <Card style={{ borderRadius: 22, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>Today's game plan 🎯</span>
          <span style={{ marginLeft: "auto" }}>{dismiss}</span>
        </div>
        {note ? (
          <div style={{ fontSize: 12.5, color: "#4a5a52", lineHeight: 1.5 }}>{note}</div>
        ) : (
          actions.map((a, i) => (
            <div key={a} style={{ fontSize: 12.5, color: "#4a5a52", lineHeight: 1.5, marginTop: i ? 5 : 0 }}>• {a}</div>
          ))
        )}
      </Card>
    );
  }

  // ── parent: the candid one.
  const tone = ALERT_TONE(alert.tone);
  const counting = (alert.factors || []).filter(f => f.counts);
  const why = (alert.families || []).map(f => GUARDIAN_FAMILY_WORDS[f]).filter(Boolean);

  return (
    <Card style={{ borderRadius: 22, padding: 17, borderLeft: `3px solid ${tone}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>🛡️</span>
        <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: tone }}>{alert.headline}</span>
        <span style={{ marginLeft: "auto" }}>{dismiss}</span>
      </div>

      {counting.map(f => (
        <div key={f.id} style={{ fontSize: 11.5, color: M.sub, fontWeight: 600, lineHeight: 1.45, marginBottom: 3 }}>
          • {f.evidence || f.label}
        </div>
      ))}

      {/* No paragraph when the notes call failed — the evidence above already
          carries the substance, which is the whole point of it being deterministic. */}
      {!alert.notesError && alert.parentNote && (
        <div style={{ fontSize: 12.5, color: "#4a5a52", lineHeight: 1.5, marginTop: 10 }}>{alert.parentNote}</div>
      )}

      {why.length > 0 && (
        <div style={{ fontSize: 11, color: M.muted, fontWeight: 600, marginTop: 10 }}>
          why now: {why.join(" + ")}
        </div>
      )}
    </Card>
  );
}

export default function HomeScreen({ weekLogs, wellbeing, xp, activeThisWeek, streak, onOpenCheckin, earnedBadges, onOpenBadge, alerts, onDismissAlert, injuries, priorities, digest, showParentNotes, onOpenPlan, guardianAlert, onDismissGuardian }) {
  const today = toLocalDateStr(new Date());
  const todayWb = mergeWellbeingByDate(wellbeing || [])[today];
  const readiness = readinessScore(todayWb?.mood, todayWb?.soreness, todayWb?.sleep);
  const { thisWeekSRPE, acwr } = computeLoad(weekLogs || []);
  const status = acwrStatus(acwr);
  const lv = levelFromXp(xp);
  const openInj = openInjuries(injuries);
  const injFlag = injuryLoadFlag(injuries);
  const focusPriority = weeklyFocus(priorities);

  const c = 2 * Math.PI * 50;
  const off = readiness == null ? c : c * (1 - readiness / 100);
  const readyLabel = readiness == null ? "Check in to see your energy"
    : readiness >= 75 ? "Fully charged!" : readiness >= 55 ? "Good to go!" : "Recharge day";
  const energySub = todayWb
    ? `Mood ${todayWb.mood ?? "—"}/5 · slept ${todayWb.sleep ?? "—"}h · ${streak}-day streak 🔥`
    : "No check-in yet today — tap the card below ✨";

  const recent = [...(weekLogs || [])]
    .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))
    .slice(0, 4);

  const tileNum = (color) => ({ fontFamily: M.display, fontWeight: 700, fontSize: 24, color, lineHeight: 0.9 });
  const tileLabel = { fontSize: 10.5, color: M.sub, fontWeight: 600, marginTop: 4 };

  return (
    <>
      {/* the daily guardian — above the reminders it supersedes, and nothing at
          all on a quiet day (which is most days) */}
      <GuardianCard alert={guardianAlert} showParentNotes={showParentNotes} onDismissGuardian={onDismissGuardian} />

      {/* alerts */}
      {(alerts || []).map(a => {
        const tone = ALERT_TONE(a.tone);
        return (
          <div key={a.id} style={{
            background: `${tone}14`, borderLeft: `3px solid ${tone}`, borderRadius: "0 12px 12px 0",
            padding: "11px 13px", marginBottom: 10, display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13.5, color: tone }}>{a.title}</div>
              <div style={{ fontSize: 12, color: "#4a5a52", marginTop: 2, lineHeight: 1.4 }}>{a.body}</div>
            </div>
            <div onClick={() => onDismissAlert(a.id)} style={{ cursor: "pointer", color: M.muted, fontSize: 16, lineHeight: 1, flexShrink: 0, padding: "0 2px" }}>×</div>
          </div>
        );
      })}

      {/* open injury — nothing renders when there's none */}
      {injFlag && (
        <Card style={{ borderRadius: 18, padding: 16, borderLeft: `3px solid ${ALERT_TONE(injFlag.tone)}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>🩹</span>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: ALERT_TONE(injFlag.tone) }}>
              {openInj.map(i => i.bodyArea).join(", ")}
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 6 }}>
            {openInj.map(i => (
              <span key={i.id} style={{ fontSize: 11.5, color: M.sub, fontWeight: 600 }}>
                Severity {i.severity}/5 · {injuryDuration(i) ?? "?"} day{injuryDuration(i) === 1 ? "" : "s"} open
              </span>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#4a5a52", lineHeight: 1.4 }}>{injFlag.guidance}</div>
        </Card>
      )}

      {/* energy hero */}
      <Card style={{ borderRadius: 26, padding: 20, display: "flex", alignItems: "center", gap: 16, boxShadow: M.dropLg }}>
        <div style={{ position: "relative", width: 118, height: 118, flexShrink: 0 }}>
          <svg width="118" height="118" viewBox="0 0 118 118">
            <defs>
              <linearGradient id="engH" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={M.ringGradFrom} /><stop offset="1" stopColor={M.ringGradTo} />
              </linearGradient>
            </defs>
            <circle cx="59" cy="59" r="50" fill="none" stroke={M.dividerAlt} strokeWidth="13" />
            <circle cx="59" cy="59" r="50" fill="none" stroke="url(#engH)" strokeWidth="13" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 59 59)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 36, lineHeight: 0.8, color: M.ink }}>{readiness ?? "—"}</div>
            <div style={{ fontSize: 10, color: M.sub, fontWeight: 700, letterSpacing: ".1em" }}>ENERGY</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink, lineHeight: 1.05 }}>{readyLabel}</div>
          <div style={{ fontSize: 12.5, color: M.sub, marginTop: 6, lineHeight: 1.45 }}>{energySub}</div>
        </div>
      </Card>

      {/* level / xp */}
      <Card style={{ borderRadius: 22, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.deepGreen, background: M.gradient, padding: "5px 12px", borderRadius: 12 }}>Lvl {lv.level}</span>
            <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.ink }}>{lv.title}</span>
          </div>
          <span style={{ fontSize: 11, color: M.sub, fontWeight: 600 }}>{lv.toNext} to Lvl {lv.level + 1}</span>
        </div>
        <div style={{ height: 13, borderRadius: 99, background: M.dividerAlt, overflow: "hidden" }}>
          <div style={{ width: `${Math.round((lv.intoLevel / XP_PER_LEVEL) * 100)}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${M.ringGradFrom},${M.ringGradTo})` }} />
        </div>
        <div style={{ fontSize: 11, color: M.sub, fontWeight: 600, marginTop: 7 }}>{lv.intoLevel} / {XP_PER_LEVEL} XP</div>
      </Card>

      {/* the Sunday orchestrator's week in review — nothing renders without a fresh digest */}
      <WeeklyDigestCard digest={digest} showParentNotes={showParentNotes} onOpenPlan={onOpenPlan} />

      {/* this week's on-court focus — nothing renders when there's no open priority */}
      {focusPriority && (
        <Card style={{ borderRadius: 22, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>🎯</span>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>This week's focus</span>
            {focusPriority.status === "escalated" && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: M.danger, background: `${M.danger}18`, padding: "2px 8px", borderRadius: 20 }}>ESCALATED</span>
            )}
          </div>
          <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.ink, marginBottom: 6 }}>{focusPriority.priority}</div>
          <div style={{ fontSize: 12.5, color: "#4a5a52", lineHeight: 1.45, marginBottom: 8 }}>{focusPracticeSuggestion(focusPriority)}</div>
          <div style={{ fontSize: 11.5, color: M.sub, fontWeight: 600 }}>
            {focusStreakText(practiceEvidence(weekLogs, focusPriority))}
          </div>
        </Card>
      )}

      {/* trophy case */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11, padding: "0 2px" }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Trophy case 🏆</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: M.sub }}>
            {Object.keys(earnedBadges || {}).length}/{BADGES.length} earned
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
          {BADGES.map(b => {
            const earned = !!earnedBadges?.[b.id];
            return (
              <div key={b.id} onClick={() => onOpenBadge(b)} style={{ flexShrink: 0, width: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <div style={{
                  width: 58, height: 58, borderRadius: 19, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 25,
                  background: earned ? M.fill : M.fillDim,
                  boxShadow: earned ? "0 3px 0 rgba(18,49,42,0.07)" : "none",
                  border: earned ? `1px solid ${M.dividerAlt}` : "1px dashed #CBD8CF",
                  filter: earned ? "none" : "grayscale(1)", opacity: earned ? 1 : 0.55,
                }}>{b.emoji}</div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: earned ? "#5f7168" : M.muted, textAlign: "center", lineHeight: 1.1 }}>{b.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* tiles */}
      <div style={{ display: "flex", gap: 11, marginBottom: 14 }}>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(M.ink)}>{Math.round(thisWeekSRPE).toLocaleString()}</div>
          <div style={tileLabel}>load / wk</div>
        </Card>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(M.tone[status.tone])}>{acwr == null ? "—" : acwr.toFixed(2)}</div>
          <div style={{ ...tileLabel, color: M.tone[status.tone], fontWeight: 700 }}>{status.label}</div>
        </Card>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(M.success)}>{activeThisWeek}</div>
          <div style={tileLabel}>days active</div>
        </Card>
      </div>

      {/* check-in card */}
      <Card style={{ cursor: "pointer" }} >
        <div onClick={onOpenCheckin}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>How I'm feeling</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5c7a0a" }}>tap to update →</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {[
              { emoji: "😊", val: todayWb?.mood ?? "—", label: "Mood", color: M.streakOrange },
              { emoji: "😴", val: todayWb?.sleep != null ? `${todayWb.sleep}h` : "—", label: "Sleep", color: M.success },
              { emoji: "💪", val: todayWb?.soreness ?? "—", label: "Achy", color: M.ink },
            ].map((s, i) => (
              <div key={s.label} style={{ textAlign: "center", flex: 1, borderLeft: i ? `1px solid ${M.dividerAlt}` : "none" }}>
                <div style={{ fontSize: 22 }}>{s.emoji}</div>
                <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: s.color, marginTop: 2 }}>{s.val}</div>
                <div style={{ fontSize: 10.5, color: M.sub, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* recent */}
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink, marginBottom: 9, paddingLeft: 2 }}>Recent</div>
      {recent.length === 0 && (
        <Card style={{ textAlign: "center", color: M.sub, fontSize: 13 }}>No sessions yet — tap ＋ to log your first! 🎾</Card>
      )}
      {recent.map(log => {
        const sport = SPORT[log.type] || SPORT.other;
        const name = log.type === "match" ? `Match — ${log.result === "W" ? "Win 🏆" : log.result === "L" ? "Loss" : "played"}`
          : log.type === "other" ? (log.sportName || "Other sport")
          : `${sport.label} session`;
        return (
          <div key={log.id} style={{
            display: "flex", alignItems: "center", gap: 11, background: M.card, borderRadius: 14,
            padding: "11px 13px", marginBottom: 8, boxShadow: M.dropSm,
          }}>
            <span style={{
              flexShrink: 0, padding: "4px 11px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
              letterSpacing: ".03em", textTransform: "uppercase", fontFamily: M.display,
              background: `${sport.color}33`, color: "#173a2f",
            }}>{sport.label}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{name}</div>
              <div style={{ fontSize: 11, color: M.sub }}>{log.duration} min · {log.rpe != null ? `RPE ${log.rpe}` : `intensity ${log.intensity}/5`}</div>
            </div>
            <span style={{ fontSize: 11, color: M.muted, fontWeight: 700 }}>{log.date === today ? "Today" : log.date.slice(5)}</span>
          </div>
        );
      })}
    </>
  );
}
