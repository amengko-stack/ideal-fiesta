import { describe, it, expect } from "vitest";
import {
  serverTimestamp, deleteField, arrayUnion, increment, Timestamp, GeoPoint, Bytes,
} from "firebase/firestore";
import { findUndefinedPaths, assertFirestoreSafe, FirestoreUndefinedValueError } from "./firestore-safe.mjs";

// The Firestore-safe invariant the weekly-review qualification now enforces.
// The first two cases are the literal regression pair for the 2026-09-23
// production failure: the shape production rejected, and the shape the fix
// produces.

describe("findUndefinedPaths / assertFirestoreSafe — the production regression pair", () => {
  it("REJECTS the production-broken shape and names the full nested path", () => {
    const broken = { sessions: [{ exercises: [{ distanceM: undefined }] }] };
    expect(findUndefinedPaths(broken)).toEqual(["sessions.0.exercises.0.distanceM"]);
    expect(() => assertFirestoreSafe(broken)).toThrow(FirestoreUndefinedValueError);
    expect(() => assertFirestoreSafe(broken))
      .toThrow('Cannot use "undefined" as a Firestore value (found in field "sessions.0.exercises.0.distanceM")');
  });

  it("ACCEPTS the corrected shape, where the absent optional key is omitted", () => {
    const clean = { sessions: [{ exercises: [{}] }] };
    expect(findUndefinedPaths(clean)).toEqual([]);
    expect(assertFirestoreSafe(clean)).toBe(clean);
  });
});

describe("findUndefinedPaths — what counts as undefined", () => {
  it("reports every offending path in document order, through objects and arrays", () => {
    const doc = {
      a: undefined,
      b: { c: 1, d: undefined },
      list: [1, undefined, { e: undefined }],
      deep: { x: [{ y: [{ z: undefined }] }] },
    };
    expect(findUndefinedPaths(doc)).toEqual(["a", "b.d", "list.1", "list.2.e", "deep.x.0.y.0.z"]);
  });

  it("treats an array hole as undefined, as Firestore does", () => {
    const holey = [1, , 3]; // eslint-disable-line no-sparse-arrays
    expect(findUndefinedPaths({ list: holey })).toEqual(["list.1"]);
  });

  it("reports a top-level undefined document as <root>", () => {
    expect(findUndefinedPaths(undefined)).toEqual(["<root>"]);
  });

  it("carries every path on the error and says how many there were", () => {
    try {
      assertFirestoreSafe({ a: undefined, b: [undefined] }, "set plans/current");
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FirestoreUndefinedValueError);
      expect(err.paths).toEqual(["a", "b.0"]);
      expect(err.message).toMatch(/^set plans\/current: /);
      expect(err.message).toContain("2 undefined fields in total");
    }
  });
});

describe("findUndefinedPaths — legitimate values are never rejected", () => {
  it("accepts null, zero, negative and fractional numbers, NaN, empty strings and booleans", () => {
    const doc = {
      nothing: null, zero: 0, negative: -1, fraction: 0.25, nan: NaN,
      empty: "", text: "x", yes: true, no: false,
      nested: { nothing: null, zero: 0, list: [0, null, false, ""] },
    };
    expect(findUndefinedPaths(doc)).toEqual([]);
  });

  it("accepts Dates and Firestore-native values and sentinels without walking into them", () => {
    const doc = {
      when: new Date(0),
      at: Timestamp.fromMillis(0),
      where: new GeoPoint(-6.2, 106.8),
      blob: Bytes.fromUint8Array(new Uint8Array([1, 2])),
      stamp: serverTimestamp(),
      gone: deleteField(),
      tags: arrayUnion("a"),
      count: increment(1),
      list: [serverTimestamp(), Timestamp.fromMillis(1)],
    };
    expect(findUndefinedPaths(doc)).toEqual([]);
  });

  it("does not look inside class instances, whatever their internals hold", () => {
    class Opaque { constructor() { this.internal = undefined; } }
    expect(findUndefinedPaths({ value: new Opaque() })).toEqual([]);
  });

  it("walks null-prototype objects like plain ones", () => {
    const bare = Object.assign(Object.create(null), { a: undefined });
    expect(findUndefinedPaths({ bare })).toEqual(["bare.a"]);
  });
});
