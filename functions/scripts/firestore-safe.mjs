// Firestore-safe document invariant — a QUALIFICATION helper, not a Firestore
// implementation.
//
// Real Firestore rejects an entire write when any field, at any depth, holds an
// explicit `undefined`:
//
//   Cannot use "undefined" as a Firestore value
//   (found in field "sessions.`0`.exercises.`0`.distanceM")
//
// This repo never enables `ignoreUndefinedProperties`, deliberately: an
// optional field that is absent must be OMITTED by the code that builds the
// document, not silently dropped by the SDK. That makes this invariant a
// property of our object construction, so it is checked on our objects — by
// the in-memory Firestore double in qualify-weekly-review.mjs on every write
// the weekly review makes, and by the plan-persistence tests on the exact
// object destined for plans/current.
//
// The 2026-09-23 production Run-now failed on exactly this (35 of 37 exercises
// carried `distanceM: undefined`) and the old double accepted it, because it
// stored whatever it was given.
//
// What it walks and what it leaves alone:
//   • plain objects and arrays are walked, and every path is reported;
//   • an array hole counts as undefined (Firestore reads it as one);
//   • everything else is a leaf and is accepted as-is — null, numbers,
//     strings, booleans, Dates, and any class instance, which covers the
//     Firestore-native values and sentinels (FieldValue.serverTimestamp(),
//     FieldValue.delete(), Timestamp, GeoPoint, DocumentReference, Bytes).
//     Whether Firestore accepts one of those in a given position is Firestore's
//     rule, not this helper's.
//
// Paths use the plain dotted form with numeric array indices, e.g.
// `sessions.0.exercises.0.distanceM`.

const isPlainObject = (v) => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

const join = (base, key) => (base ? `${base}.${key}` : String(key));

// findUndefinedPaths(value) → every path holding an explicit undefined, in
// document order. Empty array = Firestore-safe.
export function findUndefinedPaths(value, basePath = '') {
  const out = [];
  const walk = (v, p) => {
    if (v === undefined) { out.push(p || '<root>'); return; }
    if (Array.isArray(v)) {
      // Index loop, not forEach: forEach skips holes, Firestore does not.
      for (let i = 0; i < v.length; i++) walk(v[i], join(p, i));
      return;
    }
    if (isPlainObject(v)) {
      for (const key of Object.keys(v)) walk(v[key], join(p, key));
    }
  };
  walk(value, basePath);
  return out;
}

export class FirestoreUndefinedValueError extends Error {
  constructor(paths, label) {
    const first = paths[0];
    const more = paths.length > 1 ? ` — ${paths.length} undefined fields in total` : '';
    super(
      `${label ? `${label}: ` : ''}Cannot use "undefined" as a Firestore value `
      + `(found in field "${first}")${more}`
    );
    this.name = 'FirestoreUndefinedValueError';
    this.paths = paths;
  }
}

// assertFirestoreSafe(value, label?) — throws FirestoreUndefinedValueError
// naming the first offending path (and carrying all of them on `.paths`).
// Returns the value unchanged when it is safe, so it can wrap a write.
export function assertFirestoreSafe(value, label = '') {
  const paths = findUndefinedPaths(value);
  if (paths.length) throw new FirestoreUndefinedValueError(paths, label);
  return value;
}
