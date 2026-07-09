import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";
import { FITNESS_TESTS } from "../lib/fitnessTests.js";

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid #D6E2DB",
  borderRadius: 12, background: M.card, fontFamily: M.display, fontWeight: 600,
  fontSize: 14, color: M.ink, outline: "none", marginBottom: 18,
};

export default function BenchmarkSheet({ athleteId, onSaved, onClose }) {
  const [testName, setTestName] = useState(FITNESS_TESTS[0].name);
  const [result, setResult]     = useState("");
  const [date, setDate]         = useState(toLocalDateStr(new Date()));
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);

  const testDef = FITNESS_TESTS.find(t => t.name === testName);

  const save = () => {
    if (saving) return;
    const val = parseFloat(result);
    if (!val || val <= 0 || !date) {
      onSaved("Enter the result first 📏");
      return;
    }
    setSaving(true);
    // Same entry shape as the classic BenchmarksTab. Fire-and-forget.
    addDoc(collection(db, "athletes", athleteId, "benchmarks"), {
      testName, result: val, unit: testDef?.unit ?? "", date, notes: notes.trim(),
    }).catch(e => console.error("BenchmarkSheet save:", e));
    onSaved(`${testName} logged 📊`);
    onClose();
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 16 }}>Log a benchmark 📊</div>
      <div style={label}>Which test?</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {FITNESS_TESTS.map(t => {
          const sel = testName === t.name;
          return (
            <div key={t.name} onClick={() => setTestName(t.name)} style={{
              cursor: "pointer", padding: "9px 13px", borderRadius: 12, fontFamily: M.display,
              fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap",
              background: sel ? M.gradient : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
              boxShadow: sel ? `0 3px 0 ${M.brandShadow}` : "none",
            }}>{t.name}</div>
          );
        })}
      </div>
      <div style={label}>Result ({testDef?.unit ?? ""})</div>
      <input type="number" inputMode="decimal" value={result} onChange={e => setResult(e.target.value)} placeholder={`in ${testDef?.unit ?? ""}`} style={input} />
      <div style={label}>Date</div>
      <input type="date" value={date} max={toLocalDateStr(new Date())} onChange={e => setDate(e.target.value)} style={input} />
      <div style={label}>Notes (optional)</div>
      <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. after warm-up, second attempt" style={input} />
      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16, padding: 16,
        textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16, boxShadow: M.cta,
        opacity: saving ? 0.6 : 1,
      }}>Save result 🎉</div>
    </>
  );
}
