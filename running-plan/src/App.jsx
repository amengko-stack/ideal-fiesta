import { useState, useEffect, useCallback } from "react";
import {
  Activity, BarChart2, Calendar, Heart, Link2, Moon, RefreshCw,
  Settings, Trash2, TrendingUp, Watch, Zap,
} from "lucide-react";
import { auth, DEMO } from "./firebase";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  loadProfile, saveProfile, loadCheckins, saveCheckin,
  loadRuns, addRun, deleteRun, loadPlan, savePlan,
  loadIntegration, saveIntegration,
} from "./store";

// In development the Express proxy runs on localhost:3001 (Vite proxies /api).
// In production (Firebase Hosting) /api/* is rewritten to the Cloud Function.
const API_URL = "/api";

const ALLOWED_USERS = new Set([
  "jFXQ9SamJ6QnIpaam5dLedKcFkA2",
  "2Hxj2FUJP4YQSvnsR2fkStu0uoC2",
  "qmj32jhoYnQ9OJCQCXM1soIhHPx2",
]);

const GOALS = ["5K", "10K", "Half Marathon", "Marathon"];
const FITNESS_LEVELS = ["Beginner", "Intermediate", "Advanced"];

const RUN_TYPE_LABELS = {
  easy_run: "Easy Run", tempo: "Tempo", intervals: "Intervals",
  long_run: "Long Run", rest: "Rest", cross_train: "Cross Train",
  recovery_run: "Recovery Run",
};

// ─── DATE / FORMAT HELPERS ───────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];

function getWeekBounds(weeksAgo) {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(now.getDate() - daysToMonday - weeksAgo * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return {
    start: start.toISOString().split("T")[0],
    end:   end.toISOString().split("T")[0],
  };
}

function formatPace(minPerKm) {
  if (!minPerKm || !isFinite(minPerKm)) return "—";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")}/km`;
}

// ─── ADAPTIVE SCORING ────────────────────────────────────────────────────────
function runningLoad(log) {
  const distanceFactor = Math.min((log.distanceKm || 0) / 10, 1.5) || 0.3;
  return (log.rpe || 5) * (log.durationMin || 30) * distanceFactor;
}

function calculateRunningMetrics(runs, checkins) {
  const weekLoads = [0, 1, 2, 3].map(weeksAgo => {
    const { start, end } = getWeekBounds(weeksAgo);
    return (runs || [])
      .filter(r => r.date >= start && r.date < end)
      .reduce((sum, r) => sum + runningLoad(r), 0);
  });
  const acuteLoad = weekLoads[0];
  const chronicLoad = weekLoads.reduce((a, b) => a + b, 0) / 4;
  const acwr = chronicLoad > 0 ? Math.round((acuteLoad / chronicLoad) * 100) / 100 : null;

  const { start: weekStart, end: weekEnd } = getWeekBounds(0);
  const thisWeekRuns = (runs || []).filter(r => r.date >= weekStart && r.date < weekEnd);
  const weeklyKm  = thisWeekRuns.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const weeklyMin = thisWeekRuns.reduce((s, r) => s + (r.durationMin || 0), 0);
  const avgPace   = weeklyKm > 0 ? weeklyMin / weeklyKm : null;

  const weekKms = [7, 6, 5, 4, 3, 2, 1, 0].map(weeksAgo => {
    const { start, end } = getWeekBounds(weeksAgo);
    return {
      label: weeksAgo === 0 ? "Now" : `-${weeksAgo}w`,
      km: Math.round((runs || [])
        .filter(r => r.date >= start && r.date < end)
        .reduce((s, r) => s + (r.distanceKm || 0), 0) * 10) / 10,
    };
  });

  return {
    acuteLoad: Math.round(acuteLoad),
    chronicLoad: Math.round(chronicLoad),
    acwr,
    weeklyKm: Math.round(weeklyKm * 10) / 10,
    avgPace,
    weekKms,
    recoveryScore: calculateRecoveryScore(checkins),
  };
}

function calculateRecoveryScore(checkins) {
  const recent = (checkins || []).slice(0, 7);
  if (recent.length === 0) return null;

  const avg = field => {
    const vals = recent.filter(c => c[field] != null).map(c => c[field]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const norm = (v) => v != null ? (v - 1) / 4 : null;
  const sleepScore    = norm(avg("sleep"));
  const energyScore   = norm(avg("energy"));
  const moodScore     = norm(avg("mood"));
  const rawSoreness   = avg("soreness");
  const sorenessScore = rawSoreness != null ? 1 - (rawSoreness - 1) / 4 : null;

  // Base weights; WHOOP recovery (already 0-100) takes 40% when present,
  // remaining factors rescale to fill the other 60%.
  const whoopVals = recent.filter(c => c.whoopRecovery != null).map(c => c.whoopRecovery);
  const whoopAvg  = whoopVals.length ? whoopVals.reduce((a, b) => a + b, 0) / whoopVals.length : null;

  const parts = [
    { score: sleepScore,    weight: 0.30 },
    { score: energyScore,   weight: 0.25 },
    { score: sorenessScore, weight: 0.25 },
    { score: moodScore,     weight: 0.20 },
  ].filter(p => p.score != null);
  if (parts.length === 0 && whoopAvg == null) return null;

  const totalW = parts.reduce((s, p) => s + p.weight, 0);
  const manualScore = totalW > 0
    ? parts.reduce((s, p) => s + p.score * p.weight, 0) / totalW
    : null;

  if (whoopAvg != null && manualScore != null)
    return Math.round(whoopAvg * 0.4 + manualScore * 100 * 0.6);
  if (whoopAvg != null) return Math.round(whoopAvg);
  return Math.round(manualScore * 100);
}

function getAdaptationFlags(runs, checkins, acwr) {
  const recent7 = (checkins || []).slice(0, 7);
  const avg = field => {
    const vals = recent7.filter(c => c[field] != null).map(c => c[field]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const flags = [];
  const avgSoreness = avg("soreness");
  const avgSleep    = avg("sleep");
  const avgHours    = avg("sleepHours");
  const avgEnergy   = avg("energy");

  if (avgSoreness != null && avgSoreness > 3.5)
    flags.push({ type: "HIGH_SORENESS", value: avgSoreness.toFixed(1), action: "reduce_intensity" });
  if ((avgSleep != null && avgSleep < 2.5) || (avgHours != null && avgHours < 6))
    flags.push({ type: "POOR_SLEEP", value: avgHours != null ? `${avgHours.toFixed(1)}h` : avgSleep.toFixed(1), action: "reduce_volume" });
  if (avgEnergy != null && avgEnergy < 2.5)
    flags.push({ type: "LOW_ENERGY", value: avgEnergy.toFixed(1), action: "add_rest_day" });

  if (acwr != null && acwr > 1.5)
    flags.push({ type: "ACWR_DANGER", value: acwr, action: "recovery_week" });
  else if (acwr != null && acwr > 1.3)
    flags.push({ type: "ACWR_CAUTION", value: acwr, action: "reduce_volume" });
  else if (acwr != null && acwr < 0.8 && acwr > 0)
    flags.push({ type: "UNDERLOADED", value: acwr, action: "increase_load" });

  // WHOOP low recovery: 3-day average below 40%
  const whoop3 = recent7.slice(0, 3).filter(c => c.whoopRecovery != null).map(c => c.whoopRecovery);
  if (whoop3.length >= 2 && whoop3.reduce((a, b) => a + b, 0) / whoop3.length < 40)
    flags.push({ type: "WHOOP_LOW_RECOVERY", value: Math.round(whoop3.reduce((a, b) => a + b, 0) / whoop3.length) + "%", action: "recovery_week" });

  // HRV declining: recent-half average >10% below older-half average
  const hrvs = recent7.filter(c => c.hrv != null).map(c => c.hrv);
  if (hrvs.length >= 4) {
    const half = Math.floor(hrvs.length / 2);
    const recentAvg = hrvs.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const olderAvg  = hrvs.slice(half).reduce((a, b) => a + b, 0) / (hrvs.length - half);
    if (olderAvg > 0 && recentAvg < olderAvg * 0.9)
      flags.push({ type: "HRV_DECLINING", value: `${Math.round(recentAvg)}ms vs ${Math.round(olderAvg)}ms`, action: "reduce_volume" });
  }

  const last5 = (checkins || []).slice(0, 5);
  if (last5.length === 5 && last5.every(c => (c.soreness ?? 3) <= 2 && (c.energy ?? 3) >= 4))
    flags.push({ type: "CONSECUTIVE_GOOD", value: 5, action: "progressive_overload" });

  return flags;
}

// ─── AI PLAN GENERATION ──────────────────────────────────────────────────────
const PLAN_SYSTEM_PROMPT = `You are an expert running coach AI. You analyze a runner's recent training data and health metrics to generate a personalized, adaptive 7-day running plan.

Your core principle: the plan must respond to the runner's current physiological state, not a generic template. Overtraining is as harmful as undertraining. When adaptation flags indicate poor recovery, you MUST reduce load; when they indicate readiness, progress load by no more than 10% per week.

RESPONSE FORMAT:
Return ONLY a raw JSON object. Do NOT wrap it in markdown code fences. Start with { and end with }.

JSON SCHEMA:
{
  "weekStartDate": "YYYY-MM-DD",
  "adaptationDecision": "increase" | "maintain" | "decrease" | "recovery",
  "rationale": "2-3 sentences explaining why this adaptation was chosen, citing the specific metrics",
  "adaptationNote": "One sentence for the runner — direct and motivating",
  "days": [
    {
      "day": "Monday",
      "date": "YYYY-MM-DD",
      "type": "easy_run" | "tempo" | "intervals" | "long_run" | "rest" | "cross_train" | "recovery_run",
      "targetDistanceKm": number or null,
      "targetPaceMin": number or null,
      "targetDurationMin": number or null,
      "description": "Specific instructions for this session",
      "heartRateZone": "Z1" | "Z2" | "Z3" | "Z4" | "Z5" | null
    }
  ],
  "weeklyTargetKm": number,
  "keyWorkout": "Which day is the key session and why"
}`;

function nextMonday() {
  const d = new Date();
  const day = d.getDay();
  const daysToNext = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysToNext);
  return d.toISOString().split("T")[0];
}

function buildPlanPrompt(profile, checkins, runs, metrics, flags) {
  const weeksToRace = profile.targetRaceDate
    ? Math.max(0, Math.round((new Date(profile.targetRaceDate) - new Date()) / (7 * 864e5)))
    : null;

  const checkinLines = (checkins || []).slice(0, 14).map(c =>
    `  ${c.date}: Sleep ${c.sleep ?? "—"}/5${c.sleepHours ? ` (${c.sleepHours}h)` : ""}, Energy ${c.energy ?? "—"}/5, Mood ${c.mood ?? "—"}/5, Soreness ${c.soreness ?? "—"}/5` +
    (c.hrv ? `, HRV ${c.hrv}ms` : "") +
    (c.restingHR ? `, RHR ${c.restingHR}bpm` : "") +
    (c.whoopRecovery != null ? `, WHOOP recovery ${c.whoopRecovery}%` : "")
  ).join("\n") || "  No check-ins recorded";

  const cutoff14 = new Date(Date.now() - 14 * 864e5).toISOString().split("T")[0];
  const runLines = (runs || []).filter(r => r.date >= cutoff14).map(r =>
    `  ${r.date}: ${r.distanceKm}km in ${r.durationMin}min (${formatPace(r.durationMin / r.distanceKm)}), RPE ${r.rpe}/10` +
    (r.avgHR ? `, avg HR ${r.avgHR}` : "") +
    (r.source === "strava" ? " [Strava]" : "") +
    (r.notes ? `, note: ${r.notes}` : "")
  ).join("\n") || "  No runs logged";

  const rec = metrics.recoveryScore;
  return `RUNNER PROFILE:
- Name: ${profile.name || "Runner"}
- Goal: ${profile.goal || "not set"}
- Target Race Date: ${profile.targetRaceDate || "not set"}${weeksToRace != null ? ` (${weeksToRace} weeks away)` : ""}
- Current Weekly Distance: ${profile.currentWeeklyKm || "?"} km/week
- Fitness Level: ${profile.fitnessLevel || "not set"}

RECOVERY SCORE (last 7 days): ${rec != null ? rec + "/100" : "no data"}
${rec != null && rec < 40 ? "⚠ LOW RECOVERY — mandatory load reduction" : rec != null && rec > 75 ? "✓ HIGH RECOVERY — eligible for progressive overload" : "→ MODERATE RECOVERY — maintain current load"}

ADAPTATION FLAGS:
${flags.map(f => `- ${f.type}: ${f.value} → ${f.action}`).join("\n") || "- None (all metrics in normal range)"}

TRAINING LOAD:
- Acute load (this week): ${metrics.acuteLoad} au
- Chronic load (4-week avg): ${metrics.chronicLoad} au
- ACWR: ${metrics.acwr ?? "insufficient data"}

LAST 14 DAYS — HEALTH CHECK-INS:
${checkinLines}

LAST 14 DAYS — RUN LOGS:
${runLines}

TODAY'S DATE: ${todayStr()}
PLAN WEEK STARTS: ${nextMonday()}

Generate the 7-day plan starting from that Monday.`;
}

function parseAIJson(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap');`;

const COLORS = {
  bg: "#0a0e14", surface: "#111620", card: "#161d2a", border: "#1e2a3a",
  accent: "#00e5a0", accentDim: "#00b87a", accentMuted: "rgba(0,229,160,0.12)",
  yellow: "#f5c518", red: "#ff4d6d", text: "#e8edf5", muted: "#5a6a7e",
  strava: "#fc4c02", whoop: "#44d7b6",
};

const css = `
  ${FONTS}
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${COLORS.bg}; color: ${COLORS.text}; font-family: 'DM Sans', sans-serif; min-height: 100vh; }
  .app { max-width: 900px; margin: 0 auto; padding: 0 16px 80px; }
  h1, h2, h3 { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; }
  .header { padding: 16px 0 14px; border-bottom: 1px solid ${COLORS.border}; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: clamp(1.4rem, 3.5vw, 2rem); color: ${COLORS.accent}; line-height: 1; letter-spacing: 0.06em; }
  .header p { color: ${COLORS.muted}; font-size: 0.9rem; margin-top: 6px; }
  .tabs { display: flex; gap: 4px; background: ${COLORS.surface}; border-radius: 10px; padding: 4px; margin-bottom: 28px; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { flex-shrink: 0; padding: 10px 14px; border: none; border-radius: 7px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500; color: ${COLORS.muted}; background: transparent; transition: all 0.18s; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .tab.active { background: ${COLORS.accent}; color: #000; font-weight: 600; }
  .card { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .card-title { font-size: 1.1rem; color: ${COLORS.accent}; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
  .badge-green { background: rgba(0,229,160,0.15); color: ${COLORS.accent}; }
  .badge-yellow { background: rgba(245,197,24,0.15); color: ${COLORS.yellow}; }
  .badge-red { background: rgba(255,77,109,0.15); color: ${COLORS.red}; }
  .badge-gray { background: rgba(90,106,126,0.2); color: ${COLORS.muted}; }
  .badge-whoop { background: rgba(68,215,182,0.15); color: ${COLORS.whoop}; }
  .badge-strava { background: rgba(252,76,2,0.15); color: ${COLORS.strava}; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media(max-width:640px){ .grid2 { grid-template-columns: 1fr; } .grid4 { grid-template-columns: 1fr 1fr; } }
  .label { font-size: 0.75rem; color: ${COLORS.muted}; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 6px; }
  input, select, textarea { width: 100%; padding: 10px 12px; background: ${COLORS.surface}; border: 1px solid ${COLORS.border}; border-radius: 8px; color: ${COLORS.text}; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; outline: none; transition: border 0.15s; }
  input:focus, select:focus, textarea:focus { border-color: ${COLORS.accent}; }
  select option { background: ${COLORS.surface}; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.88rem; transition: all 0.15s; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: ${COLORS.accent}; color: #000; }
  .btn-primary:hover:not(:disabled) { background: ${COLORS.accentDim}; }
  .btn-ghost { background: ${COLORS.accentMuted}; color: ${COLORS.accent}; }
  .btn-danger { background: rgba(255,77,109,0.12); color: ${COLORS.red}; }
  .btn-strava { background: rgba(252,76,2,0.15); color: ${COLORS.strava}; }
  .btn-whoop { background: rgba(68,215,182,0.15); color: ${COLORS.whoop}; }
  .btn-sm { padding: 6px 12px; font-size: 0.78rem; }
  .note-box { background: ${COLORS.surface}; border-left: 3px solid ${COLORS.accent}; border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 0.83rem; color: ${COLORS.muted}; margin-bottom: 12px; }
  .note-box.warn { border-color: ${COLORS.yellow}; }
  .note-box.danger { border-color: ${COLORS.red}; }
  .stat-card { background: ${COLORS.surface}; border-radius: 10px; padding: 14px; text-align: center; }
  .stat-value { font-family: 'Bebas Neue', sans-serif; font-size: 1.9rem; color: ${COLORS.accent}; line-height: 1.1; }
  .stat-label { font-size: 0.7rem; color: ${COLORS.muted}; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
  .star-row { display: flex; gap: 6px; }
  .star { font-size: 1.3rem; cursor: pointer; transition: transform 0.1s; filter: grayscale(1); background: none; border: none; }
  .star.lit { filter: none; transform: scale(1.15); }
  .log-item { background: ${COLORS.surface}; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; font-size: 0.83rem; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .day-card { background: ${COLORS.surface}; border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 14px; margin-bottom: 10px; }
  .day-name { font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem; color: ${COLORS.text}; }
  .day-target { font-family: 'Bebas Neue', sans-serif; font-size: 1.4rem; color: ${COLORS.accent}; }
  .bar-chart { display: flex; align-items: flex-end; gap: 8px; height: 120px; margin-top: 12px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
  .bar { width: 100%; background: ${COLORS.accentDim}; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.4s; }
  .bar-label { font-size: 0.65rem; color: ${COLORS.muted}; }
  .bar-val { font-size: 0.68rem; color: ${COLORS.accent}; }
  .flex { display: flex; align-items: center; gap: 10px; }
  .flex-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .mt8 { margin-top: 8px; } .mt16 { margin-top: 16px; }
  .empty { text-align: center; color: ${COLORS.muted}; padding: 32px 0; font-size: 0.9rem; }
  .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid ${COLORS.border}; border-top-color: ${COLORS.accent}; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .prog-table { width: 100%; font-size: 0.82rem; border-collapse: collapse; }
  .prog-table th { text-align: left; color: ${COLORS.muted}; font-weight: 500; padding: 8px 6px 10px; border-bottom: 1px solid ${COLORS.border}; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .prog-table td { padding: 10px 6px; border-bottom: 1px solid ${COLORS.border}; vertical-align: middle; }
  .prog-table tr:last-child td { border-bottom: none; }
`;

// ─── STAR RATING INPUT ───────────────────────────────────────────────────────
function StarRating({ value, onChange, testid }) {
  return (
    <div className="star-row" data-testid={testid}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" className={`star ${value >= n ? "lit" : ""}`}
          onClick={() => onChange(n)} aria-label={`${n} of 5`}>⭐</button>
      ))}
    </div>
  );
}

// ─── AUTH ROUTER ─────────────────────────────────────────────────────────────
export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (DEMO) {
      setUser({ uid: "demo-user", displayName: "Demo Runner" });
      setAuthState("authenticated");
      return;
    }
    return onAuthStateChanged(auth, async (u) => {
      if (!u) { setAuthState("unauthenticated"); return; }
      if (!ALLOWED_USERS.has(u.uid)) {
        await signOut(auth);
        setAuthState("unauthorized");
        return;
      }
      setUser(u);
      setAuthState("authenticated");
    });
  }, []);

  if (authState === "loading")
    return (<><style>{css}</style><div className="app"><div className="empty"><span className="spinner" /></div></div></>);

  if (authState !== "authenticated")
    return <LoginScreen unauthorized={authState === "unauthorized"} />;

  return <RunnerApp uid={user.uid} user={user}
    onSignOut={() => { if (!DEMO) signOut(auth); }} />;
}

function LoginScreen({ unauthorized }) {
  const [busy, setBusy] = useState(false);
  const handleLogin = async () => {
    setBusy(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { console.error("Login error:", e); }
    setBusy(false);
  };
  return (
    <>
      <style>{css}</style>
      <div className="app" style={{ paddingTop: "18vh", textAlign: "center" }}>
        <h1 style={{ fontSize: "2.4rem", color: COLORS.accent }}>ADAPTIVE RUNNING PLAN</h1>
        <p style={{ color: COLORS.muted, margin: "12px 0 28px" }}>
          AI training plans that adapt to how your body actually feels.
        </p>
        {unauthorized && <div className="note-box danger" style={{ textAlign: "left" }}>
          This account is not authorized for this app.
        </div>}
        <button className="btn btn-primary" onClick={handleLogin} disabled={busy}>
          {busy ? <span className="spinner" /> : "Sign in with Google"}
        </button>
      </div>
    </>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", Icon: BarChart2 },
  { id: "checkin",   label: "Check-In",  Icon: Heart },
  { id: "runs",      label: "Log Run",   Icon: Activity },
  { id: "plan",      label: "Weekly Plan", Icon: Calendar },
  { id: "profile",   label: "Profile",   Icon: Settings },
];

function RunnerApp({ uid, user, onSignOut }) {
  const [tab, setTab] = useState("dashboard");
  const [profile, setProfile] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [runs, setRuns] = useState([]);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [p, c, r, pl] = await Promise.all([
      loadProfile(uid), loadCheckins(uid, 14), loadRuns(uid, 40), loadPlan(uid),
    ]);
    setProfile(p); setCheckins(c); setRuns(r); setPlan(pl);
    setLoading(false);
  }, [uid]);

  useEffect(() => { reload(); }, [reload]);

  // OAuth return: ?code=...&state=strava|whoop (redirect_uri points back here)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !["strava", "whoop"].includes(state)) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/${state}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grant_type: "authorization_code", code }),
        });
        const tokens = await res.json();
        if (tokens.access_token) {
          await saveIntegration(uid, state, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresAt: tokens.expires_at || (Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600)),
            athleteName: tokens.athlete ? `${tokens.athlete.firstname || ""} ${tokens.athlete.lastname || ""}`.trim() : null,
          });
        }
      } catch (e) { console.error(`${state} token exchange failed:`, e); }
      window.history.replaceState({}, "", window.location.pathname);
    })();
  }, [uid]);

  const metrics = calculateRunningMetrics(runs, checkins);
  const flags = getAdaptationFlags(runs, checkins, metrics.acwr);

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div>
            <h1>ADAPTIVE RUNNING PLAN</h1>
            <p>{profile?.name || user.displayName || "Runner"}{profile?.goal ? ` · ${profile.goal}` : ""}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
        <div className="tabs">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={`tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)} data-testid={`tab-${id}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {loading ? <div className="empty"><span className="spinner" /></div> : <>
          {tab === "dashboard" && <DashboardTab metrics={metrics} checkins={checkins} runs={runs} />}
          {tab === "checkin" && <CheckInTab uid={uid} checkins={checkins} onSaved={reload} />}
          {tab === "runs" && <RunLogTab uid={uid} runs={runs} onChanged={reload} />}
          {tab === "plan" && <WeeklyPlanTab uid={uid} profile={profile} checkins={checkins}
            runs={runs} metrics={metrics} flags={flags} plan={plan} onSaved={reload} />}
          {tab === "profile" && <ProfileTab uid={uid} profile={profile} onSaved={reload} />}
        </>}
      </div>
    </>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function acwrBadge(acwr) {
  if (acwr == null) return { cls: "badge-gray", label: "no data" };
  if (acwr > 1.5) return { cls: "badge-red", label: "danger" };
  if (acwr > 1.3) return { cls: "badge-yellow", label: "caution" };
  if (acwr < 0.8) return { cls: "badge-yellow", label: "underloaded" };
  return { cls: "badge-green", label: "optimal" };
}

function DashboardTab({ metrics, checkins, runs }) {
  const badge = acwrBadge(metrics.acwr);
  const maxKm = Math.max(...metrics.weekKms.map(w => w.km), 1);
  const recentRuns = runs.slice(0, 5);
  const recent7 = checkins.slice(0, 7);

  return (
    <div data-testid="dashboard">
      <div className="grid4">
        <div className="stat-card" data-testid="stat-weekly-km">
          <div className="stat-value">{metrics.weeklyKm}</div>
          <div className="stat-label">km this week</div>
        </div>
        <div className="stat-card" data-testid="stat-pace">
          <div className="stat-value">{formatPace(metrics.avgPace)}</div>
          <div className="stat-label">avg pace</div>
        </div>
        <div className="stat-card" data-testid="stat-recovery">
          <div className="stat-value" style={{
            color: metrics.recoveryScore == null ? COLORS.muted
              : metrics.recoveryScore < 40 ? COLORS.red
              : metrics.recoveryScore > 75 ? COLORS.accent : COLORS.yellow,
          }}>{metrics.recoveryScore ?? "—"}</div>
          <div className="stat-label">recovery score</div>
        </div>
        <div className="stat-card" data-testid="stat-acwr">
          <div className="stat-value">{metrics.acwr ?? "—"}</div>
          <div className="stat-label">acwr <span className={`badge ${badge.cls}`}>{badge.label}</span></div>
        </div>
      </div>

      <div className="card mt16">
        <div className="card-title"><TrendingUp size={16} /> Weekly Mileage (8 weeks)</div>
        <div className="bar-chart">
          {metrics.weekKms.map((w, i) => (
            <div className="bar-col" key={i}>
              <div className="bar-val">{w.km > 0 ? w.km : ""}</div>
              <div className="bar" style={{ height: `${(w.km / maxKm) * 80}%` }} />
              <div className="bar-label">{w.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Moon size={16} /> Wellbeing (7 days)</div>
        {recent7.length === 0 ? <div className="empty">No check-ins yet</div> : (
          <table className="prog-table">
            <thead><tr><th>Date</th><th>Sleep</th><th>Energy</th><th>Soreness</th><th>HRV</th><th>WHOOP</th></tr></thead>
            <tbody>
              {recent7.map(c => (
                <tr key={c.date}>
                  <td>{c.date.slice(5)}</td>
                  <td>{c.sleep ?? "—"}/5{c.sleepHours ? ` · ${c.sleepHours}h` : ""}</td>
                  <td>{c.energy ?? "—"}/5</td>
                  <td>{c.soreness ?? "—"}/5</td>
                  <td>{c.hrv ? `${c.hrv}ms` : "—"}</td>
                  <td>{c.whoopRecovery != null ? <span className="badge badge-whoop">{c.whoopRecovery}%</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title"><Activity size={16} /> Recent Runs</div>
        {recentRuns.length === 0 ? <div className="empty">No runs logged yet</div> :
          recentRuns.map(r => (
            <div className="log-item" key={r.id}>
              <span>{r.date} · <b>{r.distanceKm}km</b> in {r.durationMin}min · {formatPace(r.durationMin / r.distanceKm)}</span>
              <span className="flex">
                {r.source === "strava" && <span className="badge badge-strava">Strava</span>}
                <span className="badge badge-gray">RPE {r.rpe}</span>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── CHECK-IN ────────────────────────────────────────────────────────────────
function CheckInTab({ uid, checkins, onSaved }) {
  const today = todayStr();
  const existing = checkins.find(c => c.date === today);
  const [sleep, setSleep] = useState(existing?.sleep || 0);
  const [energy, setEnergy] = useState(existing?.energy || 0);
  const [mood, setMood] = useState(existing?.mood || 0);
  const [soreness, setSoreness] = useState(existing?.soreness || 0);
  const [sleepHours, setSleepHours] = useState(existing?.sleepHours || "");
  const [hrv, setHrv] = useState(existing?.hrv || "");
  const [restingHR, setRestingHR] = useState(existing?.restingHR || "");
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const handleSave = async () => {
    await saveCheckin(uid, {
      date: today,
      sleep: sleep || null, energy: energy || null,
      mood: mood || null, soreness: soreness || null,
      sleepHours: sleepHours ? parseFloat(sleepHours) : null,
      hrv: hrv ? parseInt(hrv) : null,
      restingHR: restingHR ? parseInt(restingHR) : null,
      createdAt: new Date().toISOString(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  };

  const handleWhoopSync = async () => {
    setSyncing(true); setSyncMsg("");
    try {
      let tokens = await loadIntegration(uid, "whoop");
      if (!tokens) {
        setSyncMsg("Connect WHOOP in the Profile tab first.");
        setSyncing(false);
        return;
      }
      const start = new Date(Date.now() - 7 * 864e5).toISOString();
      const [recRes, sleepRes] = await Promise.all([
        fetch(`${API_URL}/whoop/recovery?access_token=${encodeURIComponent(tokens.accessToken)}&start=${start}`),
        fetch(`${API_URL}/whoop/sleep?access_token=${encodeURIComponent(tokens.accessToken)}&start=${start}`),
      ]);
      const recovery = await recRes.json();
      const sleepData = await sleepRes.json();

      // Index WHOOP records by date, then upsert into check-ins
      const byDate = {};
      (recovery.records || []).forEach(r => {
        const date = (r.created_at || "").split("T")[0];
        if (!date) return;
        byDate[date] = {
          ...byDate[date],
          whoopRecovery: r.score?.recovery_score ?? null,
          hrv: r.score?.hrv_rmssd_milli != null ? Math.round(r.score.hrv_rmssd_milli) : null,
          restingHR: r.score?.resting_heart_rate != null ? Math.round(r.score.resting_heart_rate) : null,
        };
      });
      (sleepData.records || []).forEach(s => {
        const date = (s.end || s.created_at || "").split("T")[0];
        if (!date) return;
        const ms = s.score?.stage_summary
          ? (s.score.stage_summary.total_light_sleep_time_milli || 0) +
            (s.score.stage_summary.total_slow_wave_sleep_time_milli || 0) +
            (s.score.stage_summary.total_rem_sleep_time_milli || 0)
          : null;
        const perf = s.score?.sleep_performance_percentage;
        byDate[date] = {
          ...byDate[date],
          sleepHours: ms != null ? Math.round(ms / 36e4) / 10 : null,
          // derive 1-5 sleep quality from WHOOP sleep performance %
          sleep: perf != null ? Math.max(1, Math.min(5, Math.round(perf / 20))) : null,
        };
      });

      const dates = Object.keys(byDate);
      for (const date of dates) {
        const entry = Object.fromEntries(
          Object.entries(byDate[date]).filter(([, v]) => v != null));
        if (Object.keys(entry).length === 0) continue;
        await saveCheckin(uid, { date, ...entry, whoopSynced: true });
      }
      setSyncMsg(`Synced ${dates.length} days from WHOOP.`);
      onSaved();
    } catch (e) {
      console.error("WHOOP sync error:", e);
      setSyncMsg(`WHOOP sync failed — ${e.message}`);
    }
    setSyncing(false);
  };

  return (
    <div data-testid="checkin">
      <div className="card">
        <div className="flex-between">
          <div className="card-title" style={{ marginBottom: 0 }}><Heart size={16} /> Daily Check-In — {today}</div>
          <button className="btn btn-whoop btn-sm" onClick={handleWhoopSync} disabled={syncing} data-testid="sync-whoop">
            {syncing ? <span className="spinner" /> : <><Watch size={14} /> Sync WHOOP</>}
          </button>
        </div>
        {syncMsg && <div className="note-box mt8" data-testid="whoop-sync-msg">{syncMsg}</div>}
        {existing?.whoopSynced && <div className="mt8"><span className="badge badge-whoop">WHOOP data synced for today</span></div>}
        <div className="grid2 mt16">
          <div><div className="label">Sleep quality</div><StarRating value={sleep} onChange={setSleep} testid="rate-sleep" /></div>
          <div><div className="label">Energy</div><StarRating value={energy} onChange={setEnergy} testid="rate-energy" /></div>
          <div><div className="label">Mood</div><StarRating value={mood} onChange={setMood} testid="rate-mood" /></div>
          <div><div className="label">Muscle soreness (5 = very sore)</div><StarRating value={soreness} onChange={setSoreness} testid="rate-soreness" /></div>
        </div>
        <div className="grid2 mt16" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div><div className="label">Hours slept</div>
            <input type="number" step="0.5" min="0" max="14" value={sleepHours}
              onChange={e => setSleepHours(e.target.value)} placeholder="7.5" data-testid="input-sleep-hours" /></div>
          <div><div className="label">HRV (ms, optional)</div>
            <input type="number" min="0" value={hrv} onChange={e => setHrv(e.target.value)} placeholder="65" /></div>
          <div><div className="label">Resting HR (optional)</div>
            <input type="number" min="0" value={restingHR} onChange={e => setRestingHR(e.target.value)} placeholder="52" /></div>
        </div>
        <div className="mt16 flex">
          <button className="btn btn-primary" onClick={handleSave} data-testid="save-checkin">Save Check-In</button>
          {saved && <span className="badge badge-green" data-testid="checkin-saved">Saved</span>}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent Check-Ins</div>
        {checkins.length === 0 ? <div className="empty">Nothing yet — first check-in above.</div> :
          checkins.slice(0, 7).map(c => (
            <div className="log-item" key={c.date} data-testid="checkin-row">
              <span>{c.date} · sleep {c.sleep ?? "—"}/5 · energy {c.energy ?? "—"}/5 · soreness {c.soreness ?? "—"}/5
                {c.hrv ? ` · HRV ${c.hrv}ms` : ""}</span>
              {c.whoopRecovery != null && <span className="badge badge-whoop">WHOOP {c.whoopRecovery}%</span>}
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── RUN LOG ─────────────────────────────────────────────────────────────────
function RunLogTab({ uid, runs, onChanged }) {
  const [date, setDate] = useState(todayStr());
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [rpe, setRpe] = useState(5);
  const [avgHR, setAvgHR] = useState("");
  const [notes, setNotes] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const handleAdd = async () => {
    if (!distance || !duration) return;
    await addRun(uid, {
      date, distanceKm: parseFloat(distance), durationMin: parseInt(duration),
      rpe: parseInt(rpe), avgHR: avgHR ? parseInt(avgHR) : null,
      notes: notes.trim() || null, source: "manual",
      createdAt: new Date().toISOString(),
    });
    setDistance(""); setDuration(""); setAvgHR(""); setNotes("");
    onChanged();
  };

  const handleStravaSync = async () => {
    setSyncing(true); setSyncMsg("");
    try {
      let tokens = await loadIntegration(uid, "strava");
      if (!tokens) {
        setSyncMsg("Connect Strava in the Profile tab first.");
        setSyncing(false);
        return;
      }
      // Refresh if expired
      if (tokens.expiresAt && tokens.expiresAt < Math.floor(Date.now() / 1000) + 60 && tokens.refreshToken) {
        const r = await fetch(`${API_URL}/strava/token`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }),
        });
        const fresh = await r.json();
        if (fresh.access_token) {
          tokens = { ...tokens, accessToken: fresh.access_token, refreshToken: fresh.refresh_token || tokens.refreshToken, expiresAt: fresh.expires_at };
          await saveIntegration(uid, "strava", tokens);
        }
      }
      const after = Math.floor((Date.now() - 30 * 864e5) / 1000);
      const res = await fetch(`${API_URL}/strava/activities?access_token=${encodeURIComponent(tokens.accessToken)}&after=${after}`);
      const activities = await res.json();
      if (!Array.isArray(activities)) throw new Error(activities.error || "unexpected Strava response");

      const existingIds = new Set(runs.filter(r => r.stravaId).map(r => r.stravaId));
      let imported = 0;
      for (const a of activities) {
        if (existingIds.has(a.id)) continue;
        await addRun(uid, {
          date: (a.start_date_local || a.start_date || "").split("T")[0],
          distanceKm: Math.round((a.distance / 1000) * 100) / 100,
          durationMin: Math.round(a.moving_time / 60),
          rpe: a.suffer_score != null ? Math.max(1, Math.min(10, Math.round(a.suffer_score / 15))) : 5,
          avgHR: a.average_heartrate != null ? Math.round(a.average_heartrate) : null,
          notes: a.name || null,
          source: "strava", stravaId: a.id,
          createdAt: new Date().toISOString(),
        });
        imported++;
      }
      setSyncMsg(`Imported ${imported} run${imported === 1 ? "" : "s"} from Strava${imported < activities.length ? ` (${activities.length - imported} already imported)` : ""}.`);
      onChanged();
    } catch (e) {
      console.error("Strava sync error:", e);
      setSyncMsg(`Strava sync failed — ${e.message}`);
    }
    setSyncing(false);
  };

  return (
    <div data-testid="runlog">
      <div className="card">
        <div className="flex-between">
          <div className="card-title" style={{ marginBottom: 0 }}><Activity size={16} /> Log a Run</div>
          <button className="btn btn-strava btn-sm" onClick={handleStravaSync} disabled={syncing} data-testid="sync-strava">
            {syncing ? <span className="spinner" /> : <><RefreshCw size={14} /> Sync Strava</>}
          </button>
        </div>
        {syncMsg && <div className="note-box mt8" data-testid="strava-sync-msg">{syncMsg}</div>}
        <div className="grid2 mt16">
          <div><div className="label">Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="run-date" /></div>
          <div><div className="label">RPE (1 easy – 10 max)</div>
            <select value={rpe} onChange={e => setRpe(e.target.value)} data-testid="run-rpe">
              {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
            </select></div>
          <div><div className="label">Distance (km)</div>
            <input type="number" step="0.1" min="0" value={distance}
              onChange={e => setDistance(e.target.value)} placeholder="8.0" data-testid="run-distance" /></div>
          <div><div className="label">Duration (min)</div>
            <input type="number" min="0" value={duration}
              onChange={e => setDuration(e.target.value)} placeholder="45" data-testid="run-duration" /></div>
          <div><div className="label">Avg HR (optional)</div>
            <input type="number" min="0" value={avgHR} onChange={e => setAvgHR(e.target.value)} placeholder="152" /></div>
          <div><div className="label">Notes</div>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Felt strong on hills" /></div>
        </div>
        <div className="mt16">
          <button className="btn btn-primary" onClick={handleAdd}
            disabled={!distance || !duration} data-testid="add-run">Add Run</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Run History</div>
        {runs.length === 0 ? <div className="empty">No runs yet.</div> :
          runs.map(r => (
            <div className="log-item" key={r.id} data-testid="run-row">
              <span>{r.date} · <b>{r.distanceKm}km</b> in {r.durationMin}min · {formatPace(r.durationMin / r.distanceKm)}
                {r.notes ? ` · ${r.notes}` : ""}</span>
              <span className="flex">
                {r.source === "strava" && <span className="badge badge-strava">Strava</span>}
                <span className="badge badge-gray">RPE {r.rpe}</span>
                <button className="btn btn-danger btn-sm" onClick={async () => { await deleteRun(uid, r.id); onChanged(); }}
                  aria-label="delete run"><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── WEEKLY PLAN ─────────────────────────────────────────────────────────────
const FLAG_STYLES = {
  HIGH_SORENESS: "badge-red", POOR_SLEEP: "badge-red", LOW_ENERGY: "badge-yellow",
  ACWR_DANGER: "badge-red", ACWR_CAUTION: "badge-yellow", UNDERLOADED: "badge-yellow",
  WHOOP_LOW_RECOVERY: "badge-red", HRV_DECLINING: "badge-yellow", CONSECUTIVE_GOOD: "badge-green",
};

const DECISION_STYLES = {
  increase: { cls: "badge-green", label: "INCREASE LOAD" },
  maintain: { cls: "badge-yellow", label: "MAINTAIN" },
  decrease: { cls: "badge-yellow", label: "DECREASE LOAD" },
  recovery: { cls: "badge-red", label: "RECOVERY WEEK" },
};

function WeeklyPlanTab({ uid, profile, checkins, runs, metrics, flags, plan, onSaved }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!profile?.goal) { setError("Set your goal in the Profile tab first."); return; }
    setGenerating(true); setError("");
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: PLAN_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildPlanPrompt(profile, checkins, runs, metrics, flags) }],
          max_tokens: 4000,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "API error");
      const text = data.content?.[0]?.text;
      if (!text) throw new Error("empty AI response");
      const parsed = parseAIJson(text);
      const planDoc = { ...parsed, metrics, flags, generatedAt: new Date().toISOString() };
      await savePlan(uid, planDoc);
      onSaved();
    } catch (e) {
      console.error("Plan generation error:", e);
      setError(`Plan generation failed — ${e.message}`);
    }
    setGenerating(false);
  };

  const decision = plan?.adaptationDecision ? DECISION_STYLES[plan.adaptationDecision] : null;

  return (
    <div data-testid="weeklyplan">
      <div className="card">
        <div className="card-title"><Zap size={16} /> Current Condition</div>
        <div className="flex" style={{ flexWrap: "wrap" }} data-testid="flags">
          {flags.length === 0
            ? <span className="badge badge-green">All metrics in normal range</span>
            : flags.map(f => (
              <span key={f.type} className={`badge ${FLAG_STYLES[f.type] || "badge-gray"}`} data-testid={`flag-${f.type}`}>
                {f.type.replaceAll("_", " ")} · {f.value}
              </span>
            ))}
        </div>
        <div className="mt16">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating} data-testid="generate-plan">
            {generating ? <><span className="spinner" /> Adapting your plan…</> : "Generate This Week's Plan"}
          </button>
        </div>
        {error && <div className="note-box danger mt8" data-testid="plan-error">{error}</div>}
      </div>

      {plan && (
        <div className="card" data-testid="plan-result">
          <div className="flex-between">
            <div className="card-title" style={{ marginBottom: 0 }}>
              <Calendar size={16} /> Week of {plan.weekStartDate}
            </div>
            {decision && <span className={`badge ${decision.cls}`} data-testid="plan-decision">{decision.label}</span>}
          </div>
          {plan.adaptationNote && <div className="note-box mt16" data-testid="plan-note">{plan.adaptationNote}</div>}
          {plan.rationale && <p style={{ color: COLORS.muted, fontSize: "0.85rem", marginBottom: 14 }}>{plan.rationale}</p>}
          {(plan.days || []).map(d => (
            <div className="day-card" key={d.day} data-testid="plan-day">
              <div className="flex-between">
                <div>
                  <span className="day-name">{d.day}</span>
                  <span className={`badge ${d.type === "rest" ? "badge-gray" : "badge-green"}`} style={{ marginLeft: 10 }}>
                    {RUN_TYPE_LABELS[d.type] || d.type}
                  </span>
                  {d.heartRateZone && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>{d.heartRateZone}</span>}
                </div>
                <div className="day-target">
                  {d.targetDistanceKm ? `${d.targetDistanceKm}km` : d.targetDurationMin ? `${d.targetDurationMin}min` : ""}
                </div>
              </div>
              <p style={{ fontSize: "0.83rem", color: COLORS.muted, marginTop: 6 }}>
                {d.description}
                {d.targetPaceMin ? ` — target ${formatPace(d.targetPaceMin)}` : ""}
              </p>
            </div>
          ))}
          <div className="flex-between mt8" style={{ fontSize: "0.83rem", color: COLORS.muted }}>
            <span>Weekly target: <b style={{ color: COLORS.accent }}>{plan.weeklyTargetKm}km</b></span>
            <span>{plan.keyWorkout}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
function ProfileTab({ uid, profile, onSaved }) {
  const [name, setName] = useState(profile?.name || "");
  const [goal, setGoal] = useState(profile?.goal || "");
  const [targetRaceDate, setTargetRaceDate] = useState(profile?.targetRaceDate || "");
  const [currentWeeklyKm, setCurrentWeeklyKm] = useState(profile?.currentWeeklyKm || "");
  const [fitnessLevel, setFitnessLevel] = useState(profile?.fitnessLevel || "");
  const [saved, setSaved] = useState(false);
  const [integrations, setIntegrations] = useState({ strava: null, whoop: null });
  const [configs, setConfigs] = useState({ strava: null, whoop: null });

  useEffect(() => {
    (async () => {
      const [strava, whoop, sc, wc] = await Promise.all([
        loadIntegration(uid, "strava"),
        loadIntegration(uid, "whoop"),
        fetch(`${API_URL}/strava/config`).then(r => r.json()).catch(() => ({ enabled: false })),
        fetch(`${API_URL}/whoop/config`).then(r => r.json()).catch(() => ({ enabled: false })),
      ]);
      setIntegrations({ strava, whoop });
      setConfigs({ strava: sc, whoop: wc });
    })();
  }, [uid]);

  const handleSave = async () => {
    await saveProfile(uid, {
      name: name.trim(), goal, targetRaceDate,
      currentWeeklyKm: currentWeeklyKm ? parseFloat(currentWeeklyKm) : null,
      fitnessLevel,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  };

  const connect = async (service) => {
    const cfg = configs[service];
    if (!cfg?.enabled) return;
    if (cfg.mock) {
      // Mock mode: skip the OAuth redirect, exchange a fake code directly.
      const res = await fetch(`${API_URL}/${service}/token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code", code: "mock-code" }),
      });
      const tokens = await res.json();
      const record = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expires_at || (Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600)),
        athleteName: tokens.athlete ? `${tokens.athlete.firstname || ""} ${tokens.athlete.lastname || ""}`.trim() : null,
      };
      await saveIntegration(uid, service, record);
      setIntegrations(prev => ({ ...prev, [service]: record }));
      return;
    }
    const redirect = encodeURIComponent(window.location.origin + window.location.pathname);
    const url = service === "strava"
      ? `https://www.strava.com/oauth/authorize?client_id=${cfg.clientId}&response_type=code&redirect_uri=${redirect}&scope=activity:read_all&state=strava`
      : `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${cfg.clientId}&response_type=code&redirect_uri=${redirect}&scope=${encodeURIComponent("read:recovery read:sleep read:cycles offline")}&state=whoop`;
    window.location.href = url;
  };

  const disconnect = async (service) => {
    await saveIntegration(uid, service, null);
    setIntegrations(prev => ({ ...prev, [service]: null }));
  };

  const weeksToRace = targetRaceDate
    ? Math.max(0, Math.round((new Date(targetRaceDate) - new Date()) / (7 * 864e5)))
    : null;

  return (
    <div data-testid="profile">
      <div className="card">
        <div className="card-title"><Settings size={16} /> Runner Profile</div>
        <div className="grid2">
          <div><div className="label">Name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" data-testid="profile-name" /></div>
          <div><div className="label">Goal</div>
            <select value={goal} onChange={e => setGoal(e.target.value)} data-testid="profile-goal">
              <option value="">Select goal…</option>
              {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
            </select></div>
          <div><div className="label">Target race date {weeksToRace != null && `(${weeksToRace} weeks away)`}</div>
            <input type="date" value={targetRaceDate} onChange={e => setTargetRaceDate(e.target.value)} data-testid="profile-race-date" /></div>
          <div><div className="label">Current weekly distance (km)</div>
            <input type="number" min="0" value={currentWeeklyKm}
              onChange={e => setCurrentWeeklyKm(e.target.value)} placeholder="25" data-testid="profile-weekly-km" /></div>
          <div><div className="label">Fitness level</div>
            <select value={fitnessLevel} onChange={e => setFitnessLevel(e.target.value)} data-testid="profile-fitness">
              <option value="">Select level…</option>
              {FITNESS_LEVELS.map(f => <option key={f} value={f}>{f}</option>)}
            </select></div>
        </div>
        <div className="mt16 flex">
          <button className="btn btn-primary" onClick={handleSave} data-testid="save-profile">Save Profile</button>
          {saved && <span className="badge badge-green" data-testid="profile-saved">Saved</span>}
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Link2 size={16} /> Connected Services</div>
        {["strava", "whoop"].map(service => {
          const cfg = configs[service];
          const conn = integrations[service];
          const label = service === "strava" ? "Strava" : "WHOOP";
          return (
            <div className="log-item" key={service}>
              <span className="flex">
                {service === "strava" ? <RefreshCw size={15} color={COLORS.strava} /> : <Watch size={15} color={COLORS.whoop} />}
                <b>{label}</b>
                {conn
                  ? <span className={`badge badge-${service}`} data-testid={`${service}-connected`}>
                      Connected{conn.athleteName ? ` · ${conn.athleteName}` : ""}</span>
                  : cfg?.enabled
                    ? <span className="badge badge-gray">Not connected</span>
                    : <span className="badge badge-gray">Not configured on server</span>}
              </span>
              {conn
                ? <button className="btn btn-ghost btn-sm" onClick={() => disconnect(service)}>Disconnect</button>
                : <button className={`btn btn-${service} btn-sm`} onClick={() => connect(service)}
                    disabled={!cfg?.enabled} data-testid={`connect-${service}`}>Connect</button>}
            </div>
          );
        })}
        <p style={{ fontSize: "0.78rem", color: COLORS.muted, marginTop: 10 }}>
          Strava imports your runs automatically. WHOOP fills your daily check-in with recovery,
          HRV, resting heart rate, and sleep — the AI plan adapts to it.
        </p>
      </div>
    </div>
  );
}
