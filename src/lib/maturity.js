// ─── MATURITY OFFSET (MIRWALD) ───────────────────────────────────────────────
// Extracted from the inline calculation that used to live in BenchmarksTab.jsx.
// Pure module — no Firestore, no React. Safe to unit test in the default node
// environment the rest of src/lib/*.test.js runs in.
//
// The regression coefficients and the fractional-age computation are copied
// verbatim from the original component — do not "fix" or re-derive them.
// Fractional age (not the birthday-correct whole-year `computeAge` from
// athleteIdentity.js) is intentional: the Mirwald equation needs age as a
// continuous decimal, and swapping in whole-year age would shift every
// maturity-offset value this module has ever produced.

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function toDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Pure classifier over the offset boundaries used throughout the app:
// < -1 Pre-PHV, -1..+1 Mid-PHV, > +1 Post-PHV.
function stageForOffset(offset) {
  if (offset < -1) return "Pre-PHV";
  if (offset <= 1) return "Mid-PHV";
  return "Post-PHV";
}

// mirwaldOffset({dob, date, heightCm, sittingHeightCm, weightKg}) → {offset, stage, ageAtPHV, age} | null
export function maturityOffset({ dob, date, heightCm, sittingHeightCm, weightKg } = {}) {
  const dobDate = toDate(dob);
  const refDate = toDate(date) || new Date();

  const height        = Number(heightCm);
  const sittingHeight  = Number(sittingHeightCm);
  const weight         = Number(weightKg);

  if (!dobDate) return null;
  if (!Number.isFinite(height) || height <= 0) return null;
  if (!Number.isFinite(sittingHeight) || sittingHeight <= 0) return null;
  if (!Number.isFinite(weight) || weight <= 0) return null;

  const age = (refDate.getTime() - dobDate.getTime()) / MS_PER_YEAR;
  if (!Number.isFinite(age) || age <= 0) return null;

  const legLength = height - sittingHeight;
  const mo =
    -9.376
    + (0.0001882 * legLength * sittingHeight)
    + (0.0022    * age      * legLength)
    + (0.005841  * age      * sittingHeight)
    - (0.002658  * age      * weight)
    + (0.07693   * (weight / height) * 100);

  const offset = Math.round(mo * 100) / 100;
  const stage  = stageForOffset(offset);

  return {
    offset,
    stage,
    // Age (fractional years) at which she reaches/reached PHV.
    ageAtPHV: Math.round((age - offset) * 100) / 100,
    age,
  };
}

// The Mirwald offset is a population regression with wide individual error, and
// it is NOT a training switch: nothing in this app may use it to approve or
// prohibit an exercise, and the weekly S&C generator does not read it at all
// (it uses measured longitudinal growth velocity instead — see growth.js).
// Where it is shown, it is shown under this label.
export const MATURITY_ESTIMATE_LABEL = "Estimated maturity offset — interpret cautiously";

export const MATURITY_UNCERTAINTY_NOTE =
  "Estimated from height, sitting height, weight and age using a population regression. Individual error is large, so treat it as a rough research estimate, never as a measured developmental stage or a reason to change what she is allowed to train.";

// Descriptions only. They say what the estimate means, not what to prescribe —
// prescriptions come from the deterministic S&C framework, measured growth and
// the athlete's own training history.
const STAGE_INFO = {
  "Pre-PHV": {
    label: "Pre-PHV",
    implication: "Foundation phase estimate — the model places her before the growth spurt. Uncertain: confirm against measured height history rather than acting on this figure.",
  },
  "Mid-PHV": {
    label: "Mid-PHV",
    implication: "Rapid growth phase estimate — the model places her around the growth spurt. Uncertain: confirm against measured height history rather than acting on this figure.",
  },
  "Post-PHV": {
    label: "Post-PHV",
    implication: "Post-growth phase estimate — the model places her after the growth spurt. Uncertain: confirm against measured height history rather than acting on this figure.",
  },
};

// stageInfo(stage) → {label, implication} | null
export function stageInfo(stage) {
  return STAGE_INFO[stage] ?? null;
}
