import { useState, useEffect, useRef } from "react";
import {
  BarChart2, FileText, History, TrendingUp,
} from "lucide-react";
import {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { parsePlist, extractMatchData } from "../lib/plist.js";
import { generateSeasonReport } from "../lib/seasonReport.js";
import { COLORS } from "../styles/theme.js";
import MatchDetail from "./MatchDetail.jsx";
import SeasonReportView from "./SeasonReportView.jsx";
import { friendlyAiError } from "../lib/aiErrors.js";

// ─── MATCHES TAB ─────────────────────────────────────────────────────────────
export default function MatchesTab({ athleteId }) {
  const fileRef = useRef(null);
  const [status,              setStatus]             = useState(null);
  const [busy,                setBusy]               = useState(false);
  const [matches,             setMatches]            = useState([]);
  const [loadingMatches,      setLoadingMatches]     = useState(true);
  const [selectedMatch,       setSelectedMatch]      = useState(null);
  const [seasonReport,        setSeasonReport]       = useState(null);
  const [seasonLoading,       setSeasonLoading]      = useState(false);
  const [viewingSeasonReport, setViewingSeasonReport] = useState(false);

  // Fetch matches + cached season report on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [matchSnap, reportSnap] = await Promise.all([
          getDocs(collection(db, "matches")),
          getDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest")),
        ]);
        if (cancelled) return;
        const all = matchSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m.athleteId === athleteId)
          .sort((a, b) => {
            if (!a.matchStartTime) return 1;
            if (!b.matchStartTime) return -1;
            return b.matchStartTime.localeCompare(a.matchStartTime);
          });
        setMatches(all);
        if (reportSnap.exists()) setSeasonReport(reportSnap.data());
      } catch (err) {
        console.error("Failed to load matches:", err);
      } finally {
        if (!cancelled) setLoadingMatches(false);
      }
    })();
    return () => { cancelled = true; };
  }, [athleteId]);

  const handleGenerateSeasonAnalysis = async () => {
    setSeasonLoading(true);
    setStatus(null);
    try {
      const report = await generateSeasonReport(athleteId, matches);
      setSeasonReport(report);
      setViewingSeasonReport(true);
    } catch (err) {
      console.error("Season analysis error:", err);
      setStatus({ ok: false, text: `Season analysis failed — ${friendlyAiError(err)}` });
    } finally {
      setSeasonLoading(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setStatus(null);

    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = ev => resolve(ev.target.result);
        reader.onerror = () => reject(new Error("read error"));
        reader.readAsText(file);
      });

      let plistObj;
      try {
        plistObj = parsePlist(text);
      } catch (parseErr) {
        console.error("[matchtrack] parsePlist threw:", parseErr.message);
        const msg = parseErr.message === "binary-plist"
          ? "Binary plist format detected — the app expected XML. Check the console for details."
          : "Invalid file format — please select a .matchtrack file";
        setStatus({ ok: false, text: msg });
        setBusy(false);
        return;
      }

      let matchData;
      try {
        matchData = extractMatchData(plistObj);
      } catch (extractErr) {
        console.error("[matchtrack] extractMatchData threw:", extractErr);
        setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
        setBusy(false);
        return;
      }

      if (!matchData.matchId || matchData.matchId === "undefined") {
        console.error("[matchtrack] matchId missing — top-level plist keys:", Object.keys(plistObj));
        setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
        setBusy(false);
        return;
      }

      const existing = await getDoc(doc(db, "matches", matchData.matchId));
      if (existing.exists()) {
        setStatus({ ok: false, text: "This match has already been imported" });
        setBusy(false);
        return;
      }

      const stored = { ...matchData, athleteId, importedAt: new Date().toISOString() };
      await setDoc(doc(db, "matches", matchData.matchId), stored);

      // Optimistically prepend to list so it appears immediately
      setMatches(prev => [{ id: matchData.matchId, ...stored }, ...prev]);

      const dateStr = matchData.matchStartTime
        ? new Date(matchData.matchStartTime).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
        : "unknown date";
      setStatus({ ok: true, text: `Match imported — Valissa vs ${matchData.opponentName || "Opponent"} on ${dateStr}` });
    } catch (err) {
      console.error("Match import error:", err);
      setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = ts => ts
    ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "Unknown date";

  const fmtScore = match => {
    const sc = match.setScores;
    if (sc?.p1?.length) return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
    return "—";
  };

  const handleDelete = async (matchId) => {
    try {
      await deleteDoc(doc(db, "matches", matchId));
      setMatches(prev => prev.filter(m => m.id !== matchId));
      setSelectedMatch(null);
    } catch (err) {
      console.error("Failed to delete match:", err);
    }
  };

  if (selectedMatch) {
    return <MatchDetail match={selectedMatch} onBack={() => setSelectedMatch(null)} onDelete={handleDelete} athleteId={athleteId} />;
  }

  if (viewingSeasonReport && seasonReport) {
    return (
      <SeasonReportView
        report={seasonReport}
        onBack={() => setViewingSeasonReport(false)}
        onRegenerate={handleGenerateSeasonAnalysis}
        seasonLoading={seasonLoading}
      />
    );
  }

  return (
    <div>
      {/* ── Import card ── */}
      <div className="card">
        <div className="card-title"><History size={18} /> Match History</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Import .matchtrack files to build Valissa's match record.
        </p>
        <input ref={fileRef} name="matchFile" type="file" accept=".matchtrack" style={{ display: "none" }} onChange={handleFile} />
        <button
          className="btn btn-primary"
          onClick={() => { setStatus(null); fileRef.current.click(); }}
          disabled={busy}
          style={{ gap: 8 }}
        >
          <FileText size={16} />
          {busy ? "Importing…" : "Import Match File"}
        </button>
        {status && (
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: status.ok ? "rgba(0,229,160,0.12)" : "rgba(255,77,109,0.12)",
            color: status.ok ? COLORS.accent : COLORS.red,
            fontSize: "0.85rem", fontWeight: 500,
          }}>
            {status.text}
          </div>
        )}
      </div>

      {/* ── Season Intelligence ── */}
      {!loadingMatches && matches.length >= 3 && (
        <div className="card" style={{ borderColor: COLORS.accentDim }}>
          <div className="card-title" style={{ marginBottom: 6 }}>
            <TrendingUp size={16} style={{ color: COLORS.accent }} /> Season Intelligence
          </div>
          {seasonReport ? (
            <div>
              <div style={{ color: COLORS.muted, fontSize: "0.8rem", marginBottom: 12 }}>
                Last generated {new Date(seasonReport.generatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}Record: <span style={{ color: COLORS.accent, fontWeight: 600 }}>{seasonReport.overallRecord}</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={() => setViewingSeasonReport(true)} style={{ gap: 6 }}>
                  <BarChart2 size={13} /> View Season Report
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleGenerateSeasonAnalysis} disabled={seasonLoading} style={{ gap: 6 }}>
                  {seasonLoading ? "Analyzing…" : "↺ Regenerate"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 12 }}>
                {matches.length} matches recorded. Generate an AI-powered season analysis to identify patterns, improvements, and development priorities.
              </p>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleGenerateSeasonAnalysis}
                disabled={seasonLoading}
                style={{ gap: 6 }}
              >
                <TrendingUp size={13} />
                {seasonLoading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 13, height: 13, border: `2px solid ${COLORS.bg}`,
                      borderTopColor: "transparent", borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.7s linear infinite",
                    }} />
                    Analyzing season…
                  </span>
                ) : "Generate Season Analysis"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Match list ── */}
      {loadingMatches ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: COLORS.muted, fontSize: "0.85rem" }}>
          Loading matches…
        </div>
      ) : matches.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
          <History size={34} color={COLORS.muted} style={{ opacity: 0.35, marginBottom: 10 }} />
          <div style={{ color: COLORS.muted, fontSize: "0.88rem" }}>No matches imported yet</div>
        </div>
      ) : (
        matches.map(match => {
          const won   = match.whoWonMatch === 1;
          const score = fmtScore(match);
          return (
            <div key={match.id} className="card">
              <div className="flex-between" style={{ alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.97rem", marginBottom: 3 }}>
                    vs {match.opponentName || "Unknown Opponent"}
                  </div>
                  <div style={{ color: COLORS.muted, fontSize: "0.78rem" }}>{fmtDate(match.matchStartTime)}</div>
                </div>
                <span className={`badge ${won ? "badge-green" : "badge-red"}`}>
                  {won ? "Win" : "Loss"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
                <div>
                  <div className="label">Score</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem", color: COLORS.text, lineHeight: 1.1 }}>
                    {score}
                  </div>
                </div>
                {match.season ? (
                  <div>
                    <div className="label">Tournament</div>
                    <div style={{ fontSize: "0.85rem", color: COLORS.text, paddingTop: 2 }}>{match.season}</div>
                  </div>
                ) : null}
              </div>

              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedMatch(match)}>
                <BarChart2 size={13} /> View Analysis
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
