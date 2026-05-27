import {
  collection, getDocs, addDoc, updateDoc,
  query, where, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase.js";

const col = (athleteUid) =>
  collection(db, "athletes", athleteUid, "deferredPriorities");

// ── saveDeferredPriorities ───────────────────────────────────────────────────
// Takes the deferredPriorities array returned by the AI and upserts each item.
// Active document with same priority label → increment weeksDeferredCount.
// New item → create with weeksDeferredCount: 0.
export async function saveDeferredPriorities(athleteUid, deferredArray) {
  for (const item of deferredArray) {
    const label = item.priority;
    if (!label) continue;

    const snap = await getDocs(
      query(col(athleteUid), where("priority", "==", label), where("status", "==", "active"))
    );

    if (!snap.empty) {
      const existing = snap.docs[0];
      await updateDoc(doc(db, "athletes", athleteUid, "deferredPriorities", existing.id), {
        weeksDeferredCount: (existing.data().weeksDeferredCount ?? 0) + 1,
      });
    } else {
      await addDoc(col(athleteUid), {
        priority:           label,
        reason:             item.reason             ?? null,
        deferredDate:       serverTimestamp(),
        resolveCondition:   item.resolveCondition   ?? null,
        weeksDeferredCount: 0,
        status:             "active",
        addressedDate:      null,
        escalatedDate:      null,
      });
    }
  }
}

// ── resolveDeferred ──────────────────────────────────────────────────────────
// Sets status to 'resolved' and records addressedDate for the active document
// matching the given priority label.
export async function resolveDeferred(athleteUid, priorityLabel) {
  const snap = await getDocs(
    query(col(athleteUid), where("priority", "==", priorityLabel), where("status", "==", "active"))
  );

  for (const d of snap.docs) {
    await updateDoc(doc(db, "athletes", athleteUid, "deferredPriorities", d.id), {
      status:        "resolved",
      addressedDate: serverTimestamp(),
    });
  }
}

// ── checkEscalations ─────────────────────────────────────────────────────────
// Finds active items deferred 4+ weeks, marks them 'escalated', and returns
// the escalated documents so the dashboard can surface an alert.
// Requires a Firestore composite index on: status ASC, weeksDeferredCount ASC
export async function checkEscalations(athleteUid) {
  const snap = await getDocs(
    query(
      col(athleteUid),
      where("status", "==", "active"),
      where("weeksDeferredCount", ">=", 4)
    )
  );

  const escalated = [];
  for (const d of snap.docs) {
    await updateDoc(doc(db, "athletes", athleteUid, "deferredPriorities", d.id), {
      status:        "escalated",
      escalatedDate: serverTimestamp(),
    });
    escalated.push({ id: d.id, ...d.data() });
  }

  return escalated;
}
