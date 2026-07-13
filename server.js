import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

// ─── MOCK AI (offline dev/testing: MOCK_AI=1) ────────────────────────────────
// Returns an Anthropic-shaped response with a rule-based adaptive running plan
// so the running-plan app's full adaptive loop is testable without an API key.
function buildMockRunningPlan(userText) {
  const has = flag => userText.includes(flag);
  let decision = "maintain";
  if (has("ACWR_DANGER") || has("WHOOP_LOW_RECOVERY")) decision = "recovery";
  else if (has("HIGH_SORENESS") || has("POOR_SLEEP") || has("LOW_ENERGY") ||
           has("HRV_DECLINING") || has("ACWR_CAUTION")) decision = "decrease";
  else if (has("CONSECUTIVE_GOOD") || has("UNDERLOADED")) decision = "increase";

  const weekStartMatch = userText.match(/PLAN WEEK STARTS: (\d{4}-\d{2}-\d{2})/);
  const weekStart = weekStartMatch ? weekStartMatch[1] : new Date().toISOString().split("T")[0];
  const weeklyKmMatch = userText.match(/Current Weekly Distance: ([\d.]+)/);
  const baseKm = weeklyKmMatch ? parseFloat(weeklyKmMatch[1]) : 25;
  const factor = { increase: 1.1, maintain: 1.0, decrease: 0.75, recovery: 0.5 }[decision];
  const targetKm = Math.round(baseKm * factor);

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dates = dayNames.map((_, i) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  const templates = {
    recovery: [
      ["rest", null, "Full rest. Your body is asking for it.", null],
      ["recovery_run", targetKm * 0.2, "Very easy shakeout, conversational pace throughout.", "Z1"],
      ["rest", null, "Full rest or gentle stretching.", null],
      ["recovery_run", targetKm * 0.25, "Easy recovery run, keep heart rate low.", "Z1"],
      ["rest", null, "Full rest.", null],
      ["easy_run", targetKm * 0.35, "Relaxed easy run — stop if anything feels off.", "Z2"],
      ["cross_train", null, "30min easy cycling, swimming, or yoga.", "Z1"],
    ],
    decrease: [
      ["rest", null, "Rest day to absorb recent fatigue.", null],
      ["easy_run", targetKm * 0.2, "Short easy run, conversational pace.", "Z2"],
      ["cross_train", null, "40min low-impact cross training.", "Z1"],
      ["easy_run", targetKm * 0.25, "Easy run with 4 light strides at the end.", "Z2"],
      ["rest", null, "Full rest.", null],
      ["long_run", targetKm * 0.35, "Reduced long run, easy effort only.", "Z2"],
      ["recovery_run", targetKm * 0.2, "Gentle recovery jog.", "Z1"],
    ],
    maintain: [
      ["easy_run", targetKm * 0.15, "Easy aerobic run.", "Z2"],
      ["tempo", targetKm * 0.2, "10min warmup, 20min at comfortably-hard tempo, 10min cooldown.", "Z4"],
      ["rest", null, "Full rest.", null],
      ["easy_run", targetKm * 0.15, "Easy run with 6 strides.", "Z2"],
      ["rest", null, "Rest or mobility work.", null],
      ["long_run", targetKm * 0.35, "Steady long run, negative split the back half.", "Z2"],
      ["recovery_run", targetKm * 0.15, "Recovery jog.", "Z1"],
    ],
    increase: [
      ["easy_run", targetKm * 0.15, "Easy aerobic run.", "Z2"],
      ["intervals", targetKm * 0.18, "6 x 800m at 5K effort with 400m jog recovery.", "Z5"],
      ["recovery_run", targetKm * 0.12, "Recovery jog between quality days.", "Z1"],
      ["tempo", targetKm * 0.18, "15min warmup, 25min tempo, 10min cooldown.", "Z4"],
      ["rest", null, "Full rest before the long run.", null],
      ["long_run", targetKm * 0.37, "Extended long run — fuel every 40min.", "Z2"],
      ["rest", null, "Full rest.", null],
    ],
  };

  const notes = {
    recovery: "Your recovery metrics are flashing red — this week is about repair, not fitness.",
    decrease: "Your body is carrying fatigue, so we're pulling volume back this week.",
    maintain: "Metrics look steady — holding your current load this week.",
    increase: "You've stacked consistent good recovery days — time to build.",
  };
  const rationales = {
    recovery: "Multiple high-severity flags (dangerous workload ratio and/or very low WHOOP recovery) require a full recovery week. Load is cut to roughly 50% with no intensity.",
    decrease: "Recovery markers (soreness, sleep, energy, or HRV trend) are below normal range, so weekly volume drops ~25% and all intensity is removed.",
    maintain: "All health and load metrics are within normal ranges. The week keeps one tempo session and a steady long run at current volume.",
    increase: "Consecutive good recovery readings and/or an underloaded ACWR indicate readiness. Volume progresses ~10% with two quality sessions.",
  };

  const plan = {
    weekStartDate: weekStart,
    adaptationDecision: decision,
    rationale: rationales[decision],
    adaptationNote: notes[decision],
    days: templates[decision].map(([type, km, description, zone], i) => ({
      day: dayNames[i],
      date: dates[i],
      type,
      targetDistanceKm: km != null ? Math.max(2, Math.round(km * 10) / 10) : null,
      targetPaceMin: type === "tempo" ? 5.0 : type === "intervals" ? 4.5 : km != null ? 6.2 : null,
      targetDurationMin: type === "cross_train" ? 35 : null,
      description,
      heartRateZone: zone,
    })),
    weeklyTargetKm: targetKm,
    keyWorkout: decision === "recovery" ? "None — recovery is the workout this week."
      : decision === "increase" ? "Tuesday intervals — the main fitness stimulus."
      : "Saturday long run — aerobic cornerstone of the week.",
  };

  return { content: [{ type: "text", text: JSON.stringify(plan) }] };
}

app.post("/api/chat", async (req, res) => {
  const { messages, system, max_tokens } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array is required" });
  }

  if (process.env.MOCK_AI === "1") {
    const userText = messages.map(m => (typeof m.content === "string" ? m.content : "")).join("\n");
    return res.json(buildMockRunningPlan(userText));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in .env" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: max_tokens || 4000,
        system: system || "",
        messages,
      }),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach Anthropic API", detail: err.message });
  }
});

// ─── STRAVA (running-plan app) ───────────────────────────────────────────────
const STRAVA_MOCK = process.env.STRAVA_MOCK === "1";
const stravaConfigured = !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);

app.get("/api/strava/config", (req, res) => {
  res.json({
    enabled: stravaConfigured || STRAVA_MOCK,
    mock: STRAVA_MOCK,
    clientId: process.env.STRAVA_CLIENT_ID || null,
  });
});

app.post("/api/strava/token", async (req, res) => {
  if (STRAVA_MOCK) {
    return res.json({
      access_token: "mock-strava-token",
      refresh_token: "mock-strava-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      athlete: { firstname: "Mock", lastname: "Runner" },
    });
  }
  if (!stravaConfigured) return res.status(500).json({ error: "Strava not configured on server" });
  const { grant_type, code, refresh_token } = req.body;
  try {
    // Strava's token endpoint documents form-encoded bodies only.
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: grant_type || "authorization_code",
      ...(code ? { code } : {}),
      ...(refresh_token ? { refresh_token } : {}),
    });
    const upstream = await fetch("https://www.strava.com/api/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach Strava", detail: err.message });
  }
});

app.get("/api/strava/activities", async (req, res) => {
  if (STRAVA_MOCK) {
    const runs = [];
    const paces = [6.2, 5.9, 6.4, 5.1, 6.3, 6.0, 5.6, 6.5];
    for (let i = 0; i < 8; i++) {
      const daysAgo = 2 + i * 3;
      const date = new Date(Date.now() - daysAgo * 864e5);
      const km = [8, 6, 10, 5, 12, 7, 6, 16][i];
      runs.push({
        id: 9000000 + i,
        type: "Run",
        name: ["Morning Run", "Easy Run", "Tempo Tuesday", "Track Intervals",
               "Long Run", "Recovery Jog", "Hill Repeats", "Sunday Long Run"][i],
        distance: km * 1000,
        moving_time: Math.round(km * paces[i] * 60),
        start_date_local: date.toISOString(),
        average_heartrate: 138 + (i % 4) * 9,
        suffer_score: 30 + (i % 5) * 20,
      });
    }
    return res.json(runs);
  }
  if (!stravaConfigured) return res.status(500).json({ error: "Strava not configured on server" });
  const { access_token, after } = req.query;
  if (!access_token) return res.status(400).json({ error: "access_token required" });
  try {
    // Single page by design: the 30-day sync at per_page=100 covers any
    // realistic training volume, so the page loop is intentionally omitted.
    const upstream = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=100${after ? `&after=${after}` : ""}`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    const data = await upstream.json();
    if (!Array.isArray(data)) return res.status(upstream.status).json(data);
    res.json(data.filter(a => a.type === "Run" || a.sport_type === "Run"));
  } catch (err) {
    res.status(502).json({ error: "Failed to reach Strava", detail: err.message });
  }
});

// ─── WHOOP (running-plan app) ────────────────────────────────────────────────
const WHOOP_MOCK = process.env.WHOOP_MOCK === "1";
const whoopConfigured = !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET);
const WHOOP_API = "https://api.prod.whoop.com/developer/v2";

app.get("/api/whoop/config", (req, res) => {
  res.json({
    enabled: whoopConfigured || WHOOP_MOCK,
    mock: WHOOP_MOCK,
    clientId: process.env.WHOOP_CLIENT_ID || null,
  });
});

app.post("/api/whoop/token", async (req, res) => {
  if (WHOOP_MOCK) {
    return res.json({
      access_token: "mock-whoop-token",
      refresh_token: "mock-whoop-refresh",
      expires_in: 3600,
    });
  }
  if (!whoopConfigured) return res.status(500).json({ error: "WHOOP not configured on server" });
  const { grant_type, code, refresh_token, redirect_uri } = req.body;
  try {
    const params = new URLSearchParams({
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      grant_type: grant_type || "authorization_code",
      ...(code ? { code } : {}),
      ...(refresh_token ? { refresh_token } : {}),
      ...(redirect_uri ? { redirect_uri } : {}),
    });
    const upstream = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach WHOOP", detail: err.message });
  }
});

// 7 days of mock recovery/sleep — includes 3 recent poor-recovery days
// (3-day avg < 40%) so the adaptive loop (low recovery → reduced plan) is
// testable end to end.
function mockWhoopDays() {
  return [0, 1, 2, 3, 4, 5, 6].map(daysAgo => {
    const date = new Date(Date.now() - daysAgo * 864e5);
    const poor = daysAgo < 3; // last three days are rough
    return {
      date,
      recovery: poor ? 25 + daysAgo * 5 : 62 + daysAgo * 4,
      hrv: poor ? 42 : 68 + daysAgo,
      rhr: poor ? 61 : 53,
      sleepMs: (poor ? 5.4 : 7.6) * 36e5,
      sleepPerf: poor ? 58 : 88,
    };
  });
}

app.get("/api/whoop/recovery", async (req, res) => {
  if (WHOOP_MOCK) {
    return res.json({
      records: mockWhoopDays().map((d, i) => ({
        cycle_id: 5000 + i,
        created_at: d.date.toISOString(),
        score: {
          recovery_score: d.recovery,
          hrv_rmssd_milli: d.hrv,
          resting_heart_rate: d.rhr,
        },
      })),
    });
  }
  if (!whoopConfigured) return res.status(500).json({ error: "WHOOP not configured on server" });
  const { access_token, start } = req.query;
  if (!access_token) return res.status(400).json({ error: "access_token required" });
  try {
    // A 7-day sync yields <=7 recovery records, well under WHOOP's 25/page limit,
    // so next_token pagination is intentionally not followed here.
    const upstream = await fetch(`${WHOOP_API}/recovery?limit=25${start ? `&start=${encodeURIComponent(start)}` : ""}`,
      { headers: { Authorization: `Bearer ${access_token}` } });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach WHOOP", detail: err.message });
  }
});

app.get("/api/whoop/sleep", async (req, res) => {
  if (WHOOP_MOCK) {
    return res.json({
      records: mockWhoopDays().map((d, i) => ({
        id: 7000 + i,
        end: d.date.toISOString(),
        score: {
          sleep_performance_percentage: d.sleepPerf,
          stage_summary: {
            total_light_sleep_time_milli: d.sleepMs * 0.55,
            total_slow_wave_sleep_time_milli: d.sleepMs * 0.25,
            total_rem_sleep_time_milli: d.sleepMs * 0.2,
          },
        },
      })),
    });
  }
  if (!whoopConfigured) return res.status(500).json({ error: "WHOOP not configured on server" });
  const { access_token, start } = req.query;
  if (!access_token) return res.status(400).json({ error: "access_token required" });
  try {
    const upstream = await fetch(`${WHOOP_API}/activity/sleep?limit=25${start ? `&start=${encodeURIComponent(start)}` : ""}`,
      { headers: { Authorization: `Bearer ${access_token}` } });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach WHOOP", detail: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
