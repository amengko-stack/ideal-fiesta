import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetDocs  = vi.fn();
const mockAddDoc   = vi.fn();
const mockUpdateDoc = vi.fn();
const mockServerTimestamp = vi.fn(() => "SERVER_TIMESTAMP");

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...parts) => `col:${parts.join("/")}`),
  getDocs:    (...args) => mockGetDocs(...args),
  addDoc:     (...args) => mockAddDoc(...args),
  updateDoc:  (...args) => mockUpdateDoc(...args),
  query:      vi.fn((_col, ...conditions) => ({ conditions })),
  where:      vi.fn((field, op, val) => `${field}${op}${val}`),
  doc:        vi.fn((_db, ...parts) => `doc:${parts.join("/")}`),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock("../firebase.js", () => ({ db: "mock-db" }));

import {
  saveDeferredPriorities,
  resolveDeferred,
  checkEscalations,
} from "../deferredPriorities.js";

function makeSnap(docs) {
  return {
    empty: docs.length === 0,
    docs: docs.map(d => ({
      id: d.id,
      data: () => d.data,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── saveDeferredPriorities ───────────────────────────────────────────────────
describe("saveDeferredPriorities", () => {
  it("skips items without a priority label", async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]));
    await saveDeferredPriorities("uid1", [{ reason: "no label here" }]);
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("creates a new document when no existing active doc is found", async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]));
    mockAddDoc.mockResolvedValue({ id: "new-doc" });

    await saveDeferredPriorities("uid1", [
      { priority: "Speed", reason: "Needs work", resolveCondition: "Improve 5m time" },
    ]);

    expect(mockAddDoc).toHaveBeenCalledOnce();
    const addedData = mockAddDoc.mock.calls[0][1];
    expect(addedData).toMatchObject({
      priority:           "Speed",
      reason:             "Needs work",
      resolveCondition:   "Improve 5m time",
      weeksDeferredCount: 0,
      status:             "active",
      addressedDate:      null,
      escalatedDate:      null,
    });
  });

  it("uses null for optional fields when absent", async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]));
    mockAddDoc.mockResolvedValue({ id: "x" });

    await saveDeferredPriorities("uid1", [{ priority: "Fitness" }]);

    const addedData = mockAddDoc.mock.calls[0][1];
    expect(addedData.reason).toBeNull();
    expect(addedData.resolveCondition).toBeNull();
  });

  it("increments weeksDeferredCount when an active doc already exists", async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([{ id: "existing-doc", data: { weeksDeferredCount: 2 } }])
    );
    mockUpdateDoc.mockResolvedValue(undefined);

    await saveDeferredPriorities("uid1", [{ priority: "Speed" }]);

    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    expect(mockUpdateDoc.mock.calls[0][1]).toEqual({ weeksDeferredCount: 3 });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it("treats missing weeksDeferredCount as 0 before incrementing", async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([{ id: "doc1", data: {} }]) // no weeksDeferredCount field
    );
    mockUpdateDoc.mockResolvedValue(undefined);

    await saveDeferredPriorities("uid1", [{ priority: "Agility" }]);
    expect(mockUpdateDoc.mock.calls[0][1]).toEqual({ weeksDeferredCount: 1 });
  });

  it("processes multiple items independently", async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([]))
               .mockResolvedValueOnce(makeSnap([]));
    mockAddDoc.mockResolvedValue({ id: "x" });

    await saveDeferredPriorities("uid1", [
      { priority: "Speed" },
      { priority: "Strength" },
    ]);

    expect(mockAddDoc).toHaveBeenCalledTimes(2);
  });
});

// ─── resolveDeferred ─────────────────────────────────────────────────────────
describe("resolveDeferred", () => {
  it("resolves both active and escalated docs in parallel", async () => {
    mockGetDocs
      .mockResolvedValueOnce(makeSnap([{ id: "active-1",    data: { status: "active" } }]))
      .mockResolvedValueOnce(makeSnap([{ id: "escalated-1", data: { status: "escalated" } }]));
    mockUpdateDoc.mockResolvedValue(undefined);

    await resolveDeferred("uid1", "Speed");

    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    const updatePayloads = mockUpdateDoc.mock.calls.map(c => c[1]);
    for (const p of updatePayloads) {
      expect(p).toMatchObject({ status: "resolved" });
      expect(p.addressedDate).toBeDefined();
    }
  });

  it("does nothing when no matching docs exist", async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]));
    await resolveDeferred("uid1", "NonExistent");
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("resolves only active docs when no escalated ones exist", async () => {
    mockGetDocs
      .mockResolvedValueOnce(makeSnap([{ id: "a1", data: {} }]))
      .mockResolvedValueOnce(makeSnap([]));
    mockUpdateDoc.mockResolvedValue(undefined);

    await resolveDeferred("uid1", "Fitness");
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
  });
});

// ─── checkEscalations ────────────────────────────────────────────────────────
describe("checkEscalations", () => {
  it("returns empty array when no docs meet the threshold", async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]));
    const result = await checkEscalations("uid1");
    expect(result).toEqual([]);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("marks overdue docs as escalated and returns them", async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([
        { id: "doc-a", data: { priority: "Speed",    weeksDeferredCount: 4 } },
        { id: "doc-b", data: { priority: "Strength", weeksDeferredCount: 6 } },
      ])
    );
    mockUpdateDoc.mockResolvedValue(undefined);

    const result = await checkEscalations("uid1");

    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    for (const call of mockUpdateDoc.mock.calls) {
      expect(call[1]).toMatchObject({ status: "escalated" });
      expect(call[1].escalatedDate).toBeDefined();
    }

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "doc-a", priority: "Speed" });
    expect(result[1]).toMatchObject({ id: "doc-b", priority: "Strength" });
  });

  it("includes original data fields in returned escalated items", async () => {
    mockGetDocs.mockResolvedValue(
      makeSnap([{ id: "d1", data: { priority: "Endurance", weeksDeferredCount: 5, reason: "Too tired" } }])
    );
    mockUpdateDoc.mockResolvedValue(undefined);

    const [item] = await checkEscalations("uid1");
    expect(item.id).toBe("d1");
    expect(item.priority).toBe("Endurance");
    expect(item.reason).toBe("Too tired");
    expect(item.weeksDeferredCount).toBe(5);
  });
});
