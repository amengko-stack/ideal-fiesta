// ─── COACH REPORT ─────────────────────────────────────────────────────────────
// Renders a match doc (and optionally its AI analysis) as plain text that
// pastes cleanly into WhatsApp/SMS/email — the format Valissa's coach actually
// receives. Sections with no data (e.g. quick-mode matches without shot
// tagging) are omitted rather than shown as zeros.

const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : null);
const num = (v) => (v == null ? 0 : Number(v) || 0);

export function buildCoachReport(match, analysis = null) {
  const v = match.valissa || {};
  const name = match.valissaName || "Valissa";
  const won = match.whoWonMatch === 1;
  const score = (match.setScores?.p1 || [])
    .map((s, i) => `${s}-${match.setScores?.p2?.[i] ?? "?"}`)
    .join(", ");
  const date = match.matchStartTime
    ? new Date(match.matchStartTime).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const lines = [];
  lines.push(`🎾 MATCH REPORT — ${name} vs ${match.opponentName || "Opponent"}`);
  lines.push([
    date,
    `${won ? "Win" : "Loss"}${score ? ` ${score}` : ""}`,
    match.durationMin ? `${match.durationMin} min` : null,
  ].filter(Boolean).join(" · "));

  // Serve
  const serveBits = [];
  if (v.firstServePct != null && num(v.firstServePoints) + num(v.secondServePoints) > 0) {
    serveBits.push(`1st in ${Number(v.firstServePct).toFixed(0)}%`);
  }
  const fsw = pct(num(v.firstServePointsWon), num(v.firstServePoints));
  const ssw = pct(num(v.secondServePointsWon), num(v.secondServePoints));
  if (fsw) serveBits.push(`1st-serve pts won ${fsw}`);
  if (ssw) serveBits.push(`2nd-serve pts won ${ssw}`);
  if (serveBits.length) {
    lines.push("", "SERVE");
    lines.push(serveBits.join(" · "));
    lines.push(`Aces ${num(v.aces)} · Double faults ${num(v.doubleFaults)}`);
  }

  // Return
  const frw = pct(num(v.firstReturnPointsWon), num(v.firstReturnPoints));
  const srw = pct(num(v.secondReturnPointsWon), num(v.secondReturnPoints));
  if (frw || srw) {
    lines.push("", "RETURN");
    lines.push([frw && `vs 1st serve won ${frw}`, srw && `vs 2nd serve won ${srw}`].filter(Boolean).join(" · "));
  }

  // Break points
  if (num(v.breakPoints) > 0 || num(v.breakPointsFaced) > 0) {
    lines.push("", "BREAK POINTS");
    lines.push(`Converted ${num(v.breakPointsWon)}/${num(v.breakPoints)} · Saved ${num(v.breakPointsSaved)}/${num(v.breakPointsFaced)} faced`);
  }

  // Winners & errors (only when shot outcomes were tagged)
  if (num(v.winners) + num(v.unforcedErrors) + num(v.forcedErrors) > 0) {
    lines.push("", "WINNERS & ERRORS");
    const wingW = num(v.fhWinner) + num(v.bhWinner) > 0 ? ` (FH ${num(v.fhWinner)} · BH ${num(v.bhWinner)})` : "";
    const wingE = num(v.fhError) + num(v.bhError) > 0 ? ` (FH ${num(v.fhError)} · BH ${num(v.bhError)})` : "";
    lines.push(`Winners ${num(v.winners)}${wingW} · Unforced ${num(v.unforcedErrors)}${wingE} · Forced ${num(v.forcedErrors)}`);
    if (match.calculated?.wueRatio != null) lines.push(`Winner:unforced ratio ${match.calculated.wueRatio}`);
    if (num(v.dropShotWinner) + num(v.dropShotError) > 0) {
      lines.push(`Drop shots: ${num(v.dropShotWinner)} winners · ${num(v.dropShotError)} errors`);
    }
  }

  // Placement — where winners land and errors miss (shotLocation, when tagged)
  const share = (n, d) => `${Math.round((n / d) * 100)}%`;
  const pl = match.calculated?.placement?.p1;
  if (pl) {
    const wd = pl.winnersByDirection, em = pl.errorsByMiss, ed = pl.errorsByDirection;
    const wdT = wd.crosscourt + wd.downLine + wd.middle;
    const emT = em.net + em.wide + em.long;
    const edT = ed.crosscourt + ed.downLine + ed.middle;
    if (wdT + emT > 0) {
      lines.push("", "PLACEMENT");
      if (wdT > 0) lines.push(`Winners: ${share(wd.crosscourt, wdT)} crosscourt · ${share(wd.downLine, wdT)} down-line · ${share(wd.middle, wdT)} middle`);
      if (emT > 0) lines.push(`Errors missed: ${share(em.net, emT)} net · ${share(em.wide, emT)} wide · ${share(em.long, emT)} long`);
      if (edT > 0) lines.push(`Errors aimed: ${share(ed.crosscourt, edT)} crosscourt · ${share(ed.downLine, edT)} down-line · ${share(ed.middle, edT)} middle`);
    }
  }

  // Rally length
  const rd = match.calculated?.rallyDistribution;
  const rallyTotal = rd ? Object.values(rd).reduce((s, b) => s + (b?.total || 0), 0) : 0;
  if (rallyTotal > 0) {
    lines.push("", `RALLY LENGTH (${name}'s win %)`);
    lines.push(["0-4", "5-8", "9+"]
      .filter(k => rd[k]?.total > 0)
      .map(k => `${k}: ${rd[k].valissaWinPct != null ? `${Math.round(rd[k].valissaWinPct)}%` : "—"} of ${rd[k].total} pts`)
      .join(" · "));
  }

  // AI coaching notes
  if (analysis) {
    const findings = (analysis.criticalFindings || []).map(f => (typeof f === "string" ? f : f.finding)).filter(Boolean);
    const strengths = (analysis.strengthsToReinforce || []).filter(Boolean);
    if (findings.length || strengths.length || analysis.matchSummary) {
      lines.push("", "COACH NOTES (AI)");
      if (analysis.matchSummary) lines.push(analysis.matchSummary);
      findings.forEach(f => lines.push(`• ${f}`));
      if (strengths.length) lines.push(`Strengths: ${strengths.join(", ")}`);
    }
  }

  return lines.join("\n");
}

// Best-effort share: native sheet where available, clipboard otherwise.
// Resolves to "shared" | "copied" | "failed" so the UI can confirm.
export async function shareCoachReport(match, analysis = null) {
  const text = buildCoachReport(match, analysis);
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "failed"; // user cancelled — no fallback needed
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
