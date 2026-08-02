import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { parsePlist, extractMatchData } from "../lib/plist.js";
import { computeAge, chronologicalCategory } from "../lib/athleteIdentity.js";

export default function ImportSheet({ athleteId, profile, onSaved, onClose }) {
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    try {
      const text = await file.text();
      const plistObj = parsePlist(text);
      const matchData = extractMatchData(plistObj);
      // Same guard as the classic importer: a plist without an id yields the
      // literal string "undefined" — never write matches/undefined.
      if (!matchData.matchId || matchData.matchId === "undefined") {
        throw new Error("missing match id");
      }
      // Imported .matchtrack files carry no division of their own — stamp it from
      // the athlete's current profile category at import time.
      const ageCategory = profile?.competitionCategory
        || chronologicalCategory(computeAge(profile?.dob))
        || "U12";
      // Fire-and-forget: local commit is instant; syncs when online. (Parsing
      // above stays awaited — it's local and its failures matter to the user.)
      setDoc(doc(db, "matches", matchData.matchId), {
        ...matchData, ageCategory, athleteId, importedAt: new Date().toISOString(),
      }).catch(err => console.error("ImportSheet save:", err));
      onSaved(`Match vs ${matchData.opponentName || "Opponent"} imported! 🎾`);
      onClose();
    } catch (err) {
      console.error("ImportSheet:", err);
      onSaved("That doesn't look like a .matchtrack file 🙈");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 6 }}>Import a match 🎾</div>
      <div style={{ fontSize: 13, color: M.sub, marginBottom: 16, lineHeight: 1.45 }}>
        Export a <b>.matchtrack</b> file from the match-tracking app, then add it here to build the record and unlock coaching insights.
      </div>
      {busy ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 0" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", border: `3px solid ${M.dividerAlt}`, borderTopColor: M.strength, animation: "spin .7s linear infinite" }} />
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Importing the match…</div>
        </div>
      ) : (
        <label style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "#F1F8F3",
          border: "2px dashed #9bc46a", borderRadius: 18, padding: 26, cursor: "pointer",
        }}>
          <span style={{ fontSize: 30 }}>📂</span>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>Choose a .matchtrack file</span>
          <span style={{ fontSize: 11.5, color: M.sub }}>tap to browse</span>
          <input type="file" accept=".matchtrack" onChange={onFile} style={{ display: "none" }} />
        </label>
      )}
    </>
  );
}
