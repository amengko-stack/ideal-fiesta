import { useState, useEffect, useMemo } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import {
  createMatch, recordPoint, undo, reconfigure, scoreboard, liveStats, FORMATS, SHOT_TYPES, DIRECTIONS, MISSES, stepBackPending,
} from "../lib/liveScoring.js";

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };
const chip = (sel, accent = M.tennisLight) => ({
  cursor: "pointer", padding: "11px 6px", borderRadius: 14, fontSize: 14, fontWeight: 700,
  fontFamily: M.display, flex: 1, textAlign: "center", transition: "all .12s",
  background: sel ? accent : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
  boxShadow: sel ? "0 4px 0 rgba(0,0,0,0.13)" : "none", transform: sel ? "translateY(-1px)" : "none",
});
const bigBtn = (bg, color = M.deepGreen) => ({
  cursor: "pointer", background: bg, color, borderRadius: 16, padding: "18px 10px",
  textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16,
  boxShadow: "0 4px 0 rgba(18,49,42,0.12)", flex: 1, userSelect: "none",
});

const fmtClock = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

// ─── scoreboard card ──────────────────────────────────────────────────────────

function ScoreBoard({ sb, config }) {
  const rows = [
    { key: "p1", name: config.valissaName },
    { key: "p2", name: config.opponentName },
  ];
  const serverKey = sb.server === 1 ? "p1" : sb.server === 2 ? "p2" : null;
  return (
    <div style={{ background: M.darkCard, borderRadius: 20, padding: "16px 18px", marginBottom: 12, boxShadow: M.dropLg }}>
      {rows.map(({ key, name }) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0" }}>
          <span style={{ width: 10, textAlign: "center", color: M.lime, fontSize: 13 }}>
            {serverKey === key ? "●" : ""}
          </span>
          <span style={{ flex: 1, fontFamily: M.display, fontWeight: 700, fontSize: 17, color: "#eaf3ee", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </span>
          {sb.sets[key].map((g, i) => (
            <span key={i} style={{ width: 22, textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16, color: "#688577" }}>{g}</span>
          ))}
          <span style={{ width: 24, textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 18, color: "#aebfb6" }}>
            {sb.games[key]}
          </span>
          <span style={{ width: 40, textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.lime, background: "rgba(200,245,100,0.12)", borderRadius: 10, padding: "2px 0" }}>
            {sb.display[key]}
          </span>
        </div>
      ))}
      {(sb.breakPoint || sb.inTiebreak || sb.decidingPoint) && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: M.deepGreen, background: M.gradient, borderRadius: 20, padding: "4px 12px" }}>
            {sb.isSuperTb ? "MATCH TIEBREAK" : sb.inTiebreak ? "TIEBREAK" : sb.breakPoint ? "BREAK POINT" : "DECIDING POINT"}
          </span>
        </div>
      )}
    </div>
  );
}

function MomentumStrip({ momentum }) {
  if (!momentum.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 12, padding: "0 4px" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: M.muted }}>LAST {momentum.length}</span>
      <div style={{ display: "flex", gap: 4, flex: 1, justifyContent: "flex-end" }}>
        {momentum.map((w, i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: 5,
            background: w === 1 ? M.limeDim : "#f0736e", opacity: 0.45 + 0.55 * ((i + 1) / momentum.length),
          }} />
        ))}
      </div>
    </div>
  );
}

function StatChip({ title, v1, v2 }) {
  return (
    <div style={{ flex: 1, background: M.card, borderRadius: 12, padding: "8px 6px", textAlign: "center", boxShadow: M.dropSm }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: M.muted }}>{title}</div>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: M.ink, marginTop: 2 }}>
        {v1} <span style={{ color: M.muted, fontWeight: 400 }}>·</span> {v2}
      </div>
    </div>
  );
}

function LiveStatsRow({ stats }) {
  const pc = (v) => (v == null ? "—" : `${v}%`);
  return (
    <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
      <StatChip title="1ST SERVE" v1={pc(stats.p1.firstServePct)} v2={pc(stats.p2.firstServePct)} />
      <StatChip title="BREAK PTS" v1={`${stats.p1.bpConverted}/${stats.p1.bpChances}`} v2={`${stats.p2.bpConverted}/${stats.p2.bpChances}`} />
      <StatChip title="ACES · DF" v1={`${stats.p1.aces}·${stats.p1.doubleFaults}`} v2={`${stats.p2.aces}·${stats.p2.doubleFaults}`} />
    </div>
  );
}

// ─── main screen ──────────────────────────────────────────────────────────────

export default function LiveMatchScreen({ athleteId, athleteName, resume, onFinish, onDiscard, onClose }) {
  const [match, setMatch] = useState(resume || null);
  const [phase, setPhase] = useState(resume ? "play" : "setup"); // setup | play | finish
  // pending point being assembled across taps: { serve, winner, outcome }
  const [pending, setPending] = useState(null);
  const [endEarly, setEndEarly] = useState(false);
  const [settings, setSettings] = useState(null); // null | { format, noAd } — mid-match format editor
  const [rpe, setRpe] = useState(6);
  const [exactRally, setExactRally] = useState(6); // stepper value for exact rally length
  const [now, setNow] = useState(() => Date.now()); // match clock, refreshed on an interval

  // setup fields
  const [opponent, setOpponent] = useState("");
  const [format, setFormat] = useState("bo3-stb");
  const [noAd, setNoAd] = useState(true);
  const [firstServer, setFirstServer] = useState(1);
  const [mode, setMode] = useState("quick");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const sb = useMemo(() => (match ? scoreboard(match) : null), [match]);
  const stats = useMemo(() => (match ? liveStats(match) : null), [match]);
  const elapsedMin = match ? Math.max(1, Math.round((now - new Date(match.config.startedAt)) / 60000)) : 0;

  // Crash/refresh-proof: every scoring action persists the draft (offline-first,
  // fire-and-forget like every other write in this app).
  const persist = (next) => {
    setDoc(doc(db, "athletes", athleteId, "liveMatches", "current"),
      { config: next.config, log: next.log, savedAt: new Date().toISOString() })
      .catch(e => console.error("live draft save:", e));
  };

  const applyPoint = (input) => {
    const next = recordPoint(match, input);
    persist(next);
    setMatch(next);
    setPending(null);
    setExactRally(6);
    if (scoreboard(next).matchOver) setPhase("finish");
  };

  // Placement helper (Detailed mode). Errors build up a { miss, direction }
  // draft as chips are tapped; the placement step itself commits the point.
  const toggleDraft = (key, val) => setPending(p => {
    const d = { ...(p.locDraft || {}) };
    d[key] = d[key] === val ? undefined : val;
    return { ...p, locDraft: d };
  });

  const onUndo = () => {
    setPending(null);
    setEndEarly(false);
    if (match && match.log.length > 0) {
      const next = undo(match);
      persist(next);
      setMatch(next);
    }
    if (phase === "finish") setPhase("play");
  };

  const applySettings = () => {
    const next = reconfigure(match, settings);
    persist(next);
    setMatch(next);
    setPending(null); // server/context may have shifted; drop the in-progress point
    setSettings(null);
    if (scoreboard(next).matchOver) setPhase("finish");
  };

  const start = () => {
    const created = createMatch({
      format, noAd, firstServer, mode,
      valissaName: athleteName || "Valissa",
      opponentName: opponent.trim() || "Opponent",
    });
    setMatch(created);
    persist(created);
    setPhase("play");
  };

  const lastPoint = match?.log[match.log.length - 1];
  const setJustEnded = lastPoint?.setEndedOnPoint === 1 && !sb?.matchOver;
  const lastSetStats = setJustEnded ? liveStats(match, { setNumber: lastPoint.setNumber }) : null;

  const serverName = sb?.server === 1 ? match.config.valissaName : match?.config.opponentName;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 35, background: M.pageBg, overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "18px 16px 40px" }}>

        {/* top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div onClick={onClose} style={{ cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 13, color: M.sub }}>
            ‹ {phase === "setup" ? "Cancel" : "Pause & exit"}
          </div>
          {phase !== "setup" && (
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: M.ink }}>⏱ {fmtClock(elapsedMin)}</div>
          )}
          {phase === "play" && (
            <div style={{ display: "flex", gap: 8 }}>
              <div onClick={() => setSettings({ format: match.config.format, noAd: match.config.noAd })} style={{
                cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 13,
                color: M.ink, background: M.card, borderRadius: 20, padding: "8px 14px", boxShadow: M.dropSm,
              }}>⚙︎</div>
              <div onClick={onUndo} style={{
                cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 13,
                color: match?.log.length ? "#5c7a0a" : M.muted, background: M.card, borderRadius: 20,
                padding: "8px 16px", boxShadow: M.dropSm,
              }}>↩ Undo</div>
            </div>
          )}
        </div>

        {/* ── SETUP ── */}
        {phase === "setup" && (
          <>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 16 }}>Score a live match 🎾</div>

            <div style={label}>Opponent</div>
            <input
              type="text" value={opponent} onChange={e => setOpponent(e.target.value)} placeholder="Opponent's name"
              style={{
                width: "100%", boxSizing: "border-box", padding: "12px 14px",
                border: "1.5px solid #D6E2DB", borderRadius: 12, background: M.card,
                fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink,
                outline: "none", marginBottom: 18,
              }}
            />

            <div style={label}>Match format</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {Object.entries(FORMATS).map(([id, f]) => (
                <div key={id} onClick={() => setFormat(id)} style={{ ...chip(format === id), padding: "12px 10px", textAlign: "left", paddingLeft: 16 }}>
                  {f.label}
                </div>
              ))}
            </div>

            {!FORMATS[format].forcedNoAd && (
              <>
                <div style={label}>Scoring</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                  <div onClick={() => setNoAd(true)} style={chip(noAd)}>No-ad</div>
                  <div onClick={() => setNoAd(false)} style={chip(!noAd)}>Advantage</div>
                </div>
              </>
            )}

            <div style={label}>Who serves first?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <div onClick={() => setFirstServer(1)} style={chip(firstServer === 1)}>{athleteName || "Valissa"}</div>
              <div onClick={() => setFirstServer(2)} style={chip(firstServer === 2)}>{opponent.trim() || "Opponent"}</div>
            </div>

            <div style={label}>Logging detail</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div onClick={() => setMode("quick")} style={chip(mode === "quick")}>Quick</div>
              <div onClick={() => setMode("detailed")} style={chip(mode === "detailed", M.match)}>Detailed</div>
            </div>
            <div style={{ fontSize: 12, color: M.sub, lineHeight: 1.45, marginBottom: 22 }}>
              {mode === "quick"
                ? "Score, serves, aces and double faults — easy to keep up with courtside."
                : "Adds how each point ended and the shot that ended it — richer stats for the coach."}
            </div>

            <div onClick={start} style={{
              cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16,
              padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
              fontSize: 16, boxShadow: M.cta,
            }}>Start match ▶</div>
          </>
        )}

        {/* ── PLAY ── */}
        {phase === "play" && sb && (
          <>
            {settings && (
              <div style={{ background: M.card, borderRadius: 16, padding: 14, marginBottom: 12, boxShadow: M.dropSm }}>
                <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 12 }}>Match format ⚙︎</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {Object.entries(FORMATS).map(([id, f]) => (
                    <div key={id} onClick={() => setSettings(s => ({ ...s, noAd: FORMATS[id].forcedNoAd ? true : s.noAd, format: id }))}
                      style={{ ...chip(settings.format === id), padding: "12px 10px", textAlign: "left", paddingLeft: 16 }}>{f.label}</div>
                  ))}
                </div>
                {!FORMATS[settings.format].forcedNoAd && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div onClick={() => setSettings(s => ({ ...s, noAd: true }))} style={chip(settings.noAd)}>No-ad</div>
                    <div onClick={() => setSettings(s => ({ ...s, noAd: false }))} style={chip(!settings.noAd)}>Advantage</div>
                  </div>
                )}
                <div style={{ fontSize: 12, color: M.warn, lineHeight: 1.45, marginBottom: 12 }}>
                  Score is recalculated from every logged point — completed set scores and who's serving may change, and the match may end if the new format is already decided.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div onClick={applySettings} style={{ ...bigBtn(M.gradient), padding: "13px 10px", fontSize: 15 }}>Apply</div>
                  <div onClick={() => setSettings(null)} style={{ ...chip(false), padding: "13px 10px", flex: "0 0 38%" }}>Cancel</div>
                </div>
              </div>
            )}

            <ScoreBoard sb={sb} config={match.config} />
            <MomentumStrip momentum={stats.momentum} />
            <LiveStatsRow stats={stats} />

            {setJustEnded && lastSetStats && (
              <div style={{ background: M.parentBlueBg, borderRadius: 16, padding: 14, marginBottom: 12 }}>
                <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: M.parentBlue, marginBottom: 4 }}>
                  Set {lastPoint.setNumber} done — {lastPoint.pOneSetScore}-{lastPoint.pTwoSetScore}
                </div>
                <div style={{ fontSize: 12, color: M.ink, lineHeight: 1.5 }}>
                  1st serve {lastSetStats.p1.firstServePct ?? "—"}% · won {lastSetStats.p1.pointsWon} of {lastSetStats.p1.pointsWon + lastSetStats.p2.pointsWon} points
                  · breaks {lastSetStats.p1.bpConverted}/{lastSetStats.p1.bpChances}
                </div>
              </div>
            )}

            {/* point capture */}
            {!pending && (
              <>
                <div style={label}>{serverName} serving — how was the serve?</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <div onClick={() => setPending({ serve: 1 })} style={bigBtn(M.card, M.ink)}>1st serve in</div>
                  <div onClick={() => setPending({ serve: 2 })} style={bigBtn(M.card, M.ink)}>2nd serve in</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <div onClick={() => setPending({ serve: 1, pickAceServe: true })} style={bigBtn(M.gradient)}>Ace 💥</div>
                  <div onClick={() => match.config.mode === "detailed"
                    ? setPending({ serve: 2, outcome: "df" })
                    : applyPoint({ serve: 2, outcome: "df" })} style={bigBtn("#f0736e", "#fff")}>Double fault</div>
                </div>
              </>
            )}

            {pending?.pickAceServe && (
              <>
                <div style={label}>Ace — on which serve?</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <div onClick={() => applyPoint({ serve: 1, outcome: "ace" })} style={bigBtn(M.gradient)}>1st serve</div>
                  <div onClick={() => applyPoint({ serve: 2, outcome: "ace" })} style={bigBtn(M.gradient)}>2nd serve</div>
                </div>
              </>
            )}

            {pending && !pending.pickAceServe && pending.winner == null && pending.outcome == null && (
              <>
                <div style={label}>Who won the point?</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <div
                    onClick={() => match.config.mode === "detailed"
                      ? setPending(p => ({ ...p, winner: 1 }))
                      : applyPoint({ ...pending, winner: 1 })}
                    style={bigBtn(M.gradient)}
                  >{match.config.valissaName} 🎾</div>
                  <div
                    onClick={() => match.config.mode === "detailed"
                      ? setPending(p => ({ ...p, winner: 2 }))
                      : applyPoint({ ...pending, winner: 2 })}
                    style={bigBtn("#f0736e", "#fff")}
                  >{match.config.opponentName}</div>
                </div>
              </>
            )}

            {pending?.winner != null && pending.outcome == null && (
              <>
                <div style={label}>How did the point end?</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <div onClick={() => setPending(p => ({ ...p, outcome: "w" }))} style={bigBtn(M.gradient)}>Winner</div>
                  <div onClick={() => setPending(p => ({ ...p, outcome: "fE" }))} style={bigBtn(M.card, M.ink)}>Forced error</div>
                  <div onClick={() => setPending(p => ({ ...p, outcome: "ufE" }))} style={bigBtn("#f0736e", "#fff")}>Unforced</div>
                </div>
                <div onClick={() => applyPoint({ ...pending, outcome: null })} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.muted, marginBottom: 12 }}>
                  skip detail — just score it ›
                </div>
              </>
            )}

            {pending?.outcome != null && pending.outcome !== "df" && pending.rallyLength === undefined && (
              <>
                <div style={label}>Rally length</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <div onClick={() => setPending(p => ({ ...p, rallyLength: 3 }))} style={bigBtn(M.card, M.ink)}>Short (1–4)</div>
                  <div onClick={() => setPending(p => ({ ...p, rallyLength: 6 }))} style={bigBtn(M.card, M.ink)}>Medium (5–8)</div>
                  <div onClick={() => setPending(p => ({ ...p, rallyLength: 10 }))} style={bigBtn(M.card, M.ink)}>Long (9+)</div>
                </div>
                {/* exact count for the moments it matters */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div onClick={() => setExactRally(n => Math.max(0, n - 1))} style={{ ...bigBtn(M.fillAlt, M.ink), padding: "12px 0", flex: "0 0 52px" }}>–</div>
                  <div style={{ flex: 1, textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>
                    exact: {exactRally} shot{exactRally === 1 ? "" : "s"}
                  </div>
                  <div onClick={() => setExactRally(n => n + 1)} style={{ ...bigBtn(M.fillAlt, M.ink), padding: "12px 0", flex: "0 0 52px" }}>+</div>
                </div>
                <div onClick={() => setPending(p => ({ ...p, rallyLength: exactRally }))} style={{ ...bigBtn(M.gradient), marginBottom: 10 }}>{exactRally} shots →</div>
                <div onClick={() => setPending(p => ({ ...p, rallyLength: null }))} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.muted, marginBottom: 12 }}>
                  skip ›
                </div>
              </>
            )}

            {pending?.outcome != null && pending.outcome !== "df" && pending.rallyLength !== undefined && pending.shot === undefined && (
              <>
                <div style={label}>
                  {pending.outcome === "w"
                    ? `${pending.winner === 1 ? match.config.valissaName : match.config.opponentName}'s winning shot`
                    : `${pending.winner === 1 ? match.config.opponentName : match.config.valissaName}'s shot that missed`}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {SHOT_TYPES.map(s => (
                    <div key={s.code} onClick={() => setPending(p => ({ ...p, shot: s.code }))} style={{ ...chip(false), flex: "1 1 30%", padding: "12px 4px" }}>
                      {s.label}
                    </div>
                  ))}
                </div>
                <div onClick={() => setPending(p => ({ ...p, shot: null }))} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.muted, marginBottom: 12 }}>
                  skip shot ›
                </div>
              </>
            )}

            {/* placement (Detailed mode) — commits the point. Winner picks a
                direction; error builds a miss + aim draft, then logs together. */}
            {pending?.outcome != null && pending.outcome !== "df" && pending.rallyLength !== undefined && pending.shot !== undefined && (
              pending.outcome === "w" ? (
                <>
                  <div style={label}>Where did the winner land?</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {DIRECTIONS.map(d => (
                      <div key={d.key} onClick={() => applyPoint({ ...pending, location: { direction: d.key } })} style={bigBtn(M.card, M.ink)}>{d.label}</div>
                    ))}
                  </div>
                  <div onClick={() => applyPoint({ ...pending, location: null })} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.muted, marginBottom: 12 }}>
                    skip placement ›
                  </div>
                </>
              ) : (
                <>
                  <div style={label}>Where did the error miss?</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {MISSES.map(m => (
                      <div key={m.key} onClick={() => toggleDraft("miss", m.key)} style={chip(pending.locDraft?.miss === m.key, "#f0736e")}>{m.label}</div>
                    ))}
                  </div>
                  <div style={label}>Aimed (optional)</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {DIRECTIONS.map(d => (
                      <div key={d.key} onClick={() => toggleDraft("direction", d.key)} style={chip(pending.locDraft?.direction === d.key)}>{d.label}</div>
                    ))}
                  </div>
                  <div onClick={() => applyPoint({ ...pending, location: pending.locDraft || null })} style={bigBtn(M.gradient)}>Log point →</div>
                  <div onClick={() => applyPoint({ ...pending, location: null })} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.muted, margin: "10px 0 12px" }}>
                    skip placement ›
                  </div>
                </>
              )
            )}

            {/* double-fault placement (Detailed mode) */}
            {pending?.outcome === "df" && pending.location === undefined && (
              <>
                <div style={label}>Double fault — where did it miss?</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {MISSES.map(m => (
                    <div key={m.key} onClick={() => applyPoint({ ...pending, location: { miss: m.key } })} style={bigBtn(M.card, M.ink)}>{m.label}</div>
                  ))}
                </div>
                <div onClick={() => applyPoint({ ...pending })} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.muted, marginBottom: 12 }}>
                  skip ›
                </div>
              </>
            )}

            {pending && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div onClick={() => setPending(p => stepBackPending(p))} style={{ ...bigBtn(M.fillAlt, M.ink), padding: "13px 10px", fontSize: 14 }}>← Back</div>
                  <div onClick={() => setPending(null)} style={{ ...bigBtn(M.card, M.sub), padding: "13px 10px", fontSize: 13, flex: "0 0 42%" }}>✕ Restart</div>
                </div>
              </>
            )}

            {/* end early */}
            {!endEarly ? (
              <div onClick={() => setEndEarly(true)} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.danger, marginTop: 18 }}>
                End match early…
              </div>
            ) : (
              <div style={{ background: M.card, borderRadius: 16, padding: 14, marginTop: 14, boxShadow: M.dropSm }}>
                <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink, marginBottom: 10 }}>End early — what happened?</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div onClick={() => { setEndEarly(false); setPhase("finish"); }} style={{ ...chip(false), padding: "12px 10px" }}>
                    Finish & save as it stands
                  </div>
                  <div onClick={onDiscard} style={{ ...chip(false), padding: "12px 10px", color: M.danger }}>
                    Discard match (don't save)
                  </div>
                  <div onClick={() => setEndEarly(false)} style={{ ...chip(false), padding: "12px 10px" }}>
                    Keep playing
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── FINISH ── */}
        {phase === "finish" && sb && (
          <>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 4 }}>
              {sb.winner === 1 ? "Victory! 🏆" : sb.winner === 2 ? "Tough one 💪" : "Match ended"}
            </div>
            <div style={{ fontSize: 13, color: M.sub, marginBottom: 14 }}>
              vs {match.config.opponentName} · {fmtClock(elapsedMin)} on court
            </div>

            <ScoreBoard sb={sb} config={match.config} />
            <LiveStatsRow stats={stats} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9, marginTop: 8 }}>
              <span style={{ ...label, marginBottom: 0 }}>How hard was it? (feeds training load)</span>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 20, color: M.success }}>
                {rpe}<span style={{ fontSize: 11, color: M.sub }}>/10</span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 5, marginBottom: 20 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <div key={n} onClick={() => setRpe(n)} style={{
                  cursor: "pointer", flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10,
                  fontSize: 13, fontWeight: 700, fontFamily: M.display,
                  background: rpe === n ? M.strength : M.fillAlt, color: rpe === n ? M.deepGreen : "#5f7168",
                }}>{n}</div>
              ))}
            </div>

            <div onClick={() => onFinish(match, { durationMin: elapsedMin, rpe })} style={{
              cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16,
              padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
              fontSize: 16, boxShadow: M.cta, marginBottom: 12,
            }}>Save match 🎾</div>

            {!sb.matchOver && (
              <div onClick={onUndo} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.sub, marginBottom: 10 }}>
                ← back to scoring
              </div>
            )}
            {sb.matchOver && (
              <div onClick={onUndo} style={{ cursor: "pointer", textAlign: "center", fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.sub, marginBottom: 10 }}>
                ↩ undo last point (score correction)
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
