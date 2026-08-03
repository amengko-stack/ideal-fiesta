import { useState, useEffect } from "react";
import { Calendar, FileText, Ruler, Target, User } from "lucide-react";
import { TENNIS_GAPS } from "../lib/exerciseDb.js";
import { toLocalDateStr } from "../lib/dates.js";
import { COLORS } from "../styles/theme.js";
import { AGE_CATEGORIES, computeAge, chronologicalCategory, identityChipText } from "../lib/athleteIdentity.js";

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
export default function ProfileTab({ profile, saveProfile }) {
  const [form, setForm] = useState(() => profile || {
    name: "", dob: "", gaps: [],
    tennisSchedule: "", cheerSchedule: "", coachNotes: "",
    weight: "", height: "", sittingHeight: "", measurements: [],
    competitionCategory: chronologicalCategory(computeAge(profile?.dob)) || "U12",
  });
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (profile && profile.name) setForm(profile);
  }, [profile]);

  const toggleGap = (id) => {
    const current = form.gaps || [];
    const next = current.includes(id) ? current.filter(g => g !== id) : [...current, id];
    setForm(f => ({ ...f, gaps: next }));
  };

  const handleSave = async () => {
    setSaved(false); setSaveError(false);
    try {
      let updatedForm = { ...form };
      const w  = parseFloat(form.weight);
      const h  = parseFloat(form.height);
      const sh = parseFloat(form.sittingHeight);
      if (w > 0 || h > 0 || sh > 0) {
        const entry = { date: toLocalDateStr(new Date()) };
        if (w  > 0) entry.weight        = w;
        if (h  > 0) entry.height        = h;
        if (sh > 0) entry.sittingHeight = sh;
        const prev = (form.measurements || []).filter(m => m.date !== entry.date);
        updatedForm = {
          ...updatedForm,
          weight:        w  > 0 ? w  : (updatedForm.weight        || null),
          height:        h  > 0 ? h  : (updatedForm.height        || null),
          sittingHeight: sh > 0 ? sh : (updatedForm.sittingHeight || null),
          measurements: [entry, ...prev],
        };
        setForm(updatedForm);
      }
      await saveProfile(updatedForm);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch(e) {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-title"><User size={18} /> Athlete Profile</div>
        <div className="grid2">
          <div>
            <div className="label">Athlete Name</div>
            <input name="profileName" placeholder="e.g. Sofia" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <div className="label">Date of Birth</div>
            <input name="dob" type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="label">Competition Division</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {AGE_CATEGORIES.map(c => {
              // Before a division has ever been chosen the profile doc has no
              // `competitionCategory` key, so fall back to her chronological
              // division rather than a fixed U12 — never assume she plays up.
              const sel = (form.competitionCategory
                || chronologicalCategory(computeAge(form.dob))
                || "U12") === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`gap-chip ${sel ? "selected" : ""}`}
                  onClick={() => setForm(f => ({ ...f, competitionCategory: c.id }))}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div style={{ color: COLORS.muted, fontSize: "0.78rem", marginTop: 8 }}>
            {identityChipText(form)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Calendar size={18} /> Weekly Schedule</div>
        <div className="grid2">
          <div>
            <div className="label">Tennis Schedule</div>
            <input name="tennisSchedule" placeholder="e.g. Mon, Wed, Fri — 2hrs each" value={form.tennisSchedule} onChange={e => setForm(f => ({ ...f, tennisSchedule: e.target.value }))} />
          </div>
          <div>
            <div className="label">Cross-Training Schedule</div>
            <input name="cheerSchedule" placeholder="e.g. Tue, Thu — 1.5hrs each" value={form.cheerSchedule} onChange={e => setForm(f => ({ ...f, cheerSchedule: e.target.value }))} />
          </div>
        </div>
        <div className="note-box mt16">
          💡 These are for reference. The app uses actual logged sessions for load calculations.
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Ruler size={18} /> Physical Measurements</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 14 }}>Log monthly. The AI uses this to adjust loading recommendations as she grows.</p>
        <div className="grid3">
          <div>
            <div className="label">Height (cm)</div>
            <input
              name="profileHeight"
              type="number" placeholder="e.g. 155" min="100" max="220" step="0.5"
              value={form.height || ""}
              onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
            />
          </div>
          <div>
            <div className="label">Sitting Height (cm)</div>
            <input
              name="profileSittingHeight"
              type="number" placeholder="e.g. 82" min="50" max="130" step="0.5"
              value={form.sittingHeight || ""}
              onChange={e => setForm(f => ({ ...f, sittingHeight: e.target.value }))}
            />
            <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginTop: 5, lineHeight: 1.4 }}>
              Sit on a flat surface against a wall, measure from surface to top of head.
            </div>
          </div>
          <div>
            <div className="label">Weight (kg)</div>
            <input
              name="profileWeight"
              type="number" placeholder="e.g. 42" min="20" max="120" step="0.1"
              value={form.weight || ""}
              onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
            />
          </div>
        </div>
        {(form.measurements || []).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>Measurement History</div>
            {(form.measurements || []).slice(0, 6).map((m, i) => (
              <div key={i} className="stat-row" style={{ fontSize: "0.82rem" }}>
                <span style={{ color: COLORS.muted }}>{m.date}</span>
                <span style={{ display: "flex", gap: 12 }}>
                  {m.height        ? <span style={{ color: COLORS.text }}>{m.height} cm</span>         : null}
                  {m.sittingHeight ? <span style={{ color: COLORS.muted }}>sit {m.sittingHeight} cm</span> : null}
                  {m.weight        ? <span style={{ color: COLORS.text }}>{m.weight} kg</span>          : null}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="note-box mt16">
          💡 Save the profile each time you update measurements. A new entry is recorded with today's date.
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Target size={18} /> Tennis Gaps to Develop</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 14 }}>Select all areas where she needs improvement. The plan generator will prioritize exercises that target these gaps.</p>
        <div className="gap-checkbox">
          {TENNIS_GAPS.map(g => (
            <button key={g.id} className={`gap-chip ${(form.gaps||[]).includes(g.id) ? "selected" : ""}`} onClick={() => toggleGap(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
        {(form.gaps||[]).length > 0 && (
          <div style={{ marginTop: 16 }}>
            {(form.gaps||[]).map(id => {
              const g = TENNIS_GAPS.find(x => x.id === id);
              return g ? (
                <div key={id} style={{ fontSize: "0.78rem", color: COLORS.muted, marginBottom: 4 }}>
                  <span style={{ color: COLORS.tennis }}>▸ {g.label}:</span> {g.desc}
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><FileText size={18} /> Coach / Parent Notes</div>
        <textarea
          name="coachNotes"
          rows={4}
          placeholder="Any injuries, form concerns, exercises to avoid, or special instructions…"
          value={form.coachNotes}
          onChange={e => setForm(f => ({ ...f, coachNotes: e.target.value }))}
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        style={{ width: "100%", justifyContent: "center", padding: "13px" }}
      >
        {saved ? "✓ Profile Saved!" : saveError ? "⚠ Save Failed — Try Again" : "Save Profile"}
      </button>
    </div>
  );
}
