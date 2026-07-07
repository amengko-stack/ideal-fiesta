import {
  collection, getDocs, addDoc, updateDoc,
  query, where, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase.js";

const col = (athleteUid) =>
  collection(db, "athletes", athleteUid, "deferredPriorities");

// Monday-anchored week key (YYYY-MM-DD) for "now", using local date parts.
// Used to ensure weeksDeferredCount increments at most once per calendar week
// regardless of how many times a plan / match analysis is generated.
function currentWeekKey() {
  const d = new Date();
  const day = d.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - daysToMonday);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ── saveDeferredPriorities ───────────────────────────────────────────────────
// Takes the deferredPriorities array returned by the AI and upserts each item.
// Active document with same priority label → increment weeksDeferredCount, but
// only once per ISO week (guarded by lastCountedWeek). New item → create with
// weeksDeferredCount: 0.
export async function saveDeferredPriorities(athleteUid, deferredArray) {
  const thisWeek = currentWeekKey();

  for (const item of deferredArray) {
    const label = item.priority;
    if (!label) continue;

    const snap = await getDocs(
      query(col(athleteUid), where("priority", "==", label), where("status", "==", "active"))
    );

    if (!snap.empty) {
      const existing = snap.docs[0];
      const data = existing.data();
      // Already counted this week — skip so re-generating a plan doesn't inflate the count.
      if (data.lastCountedWeek === thisWeek) continue;
      await updateDoc(doc(db, "athletes", athleteUid, "deferredPriorities", existing.id), {
        weeksDeferredCount: (data.weeksDeferredCount ?? 0) + 1,
        lastCountedWeek:    thisWeek,
      });
    } else {
      await addDoc(col(athleteUid), {
        priority:           label,
        reason:             item.reason             ?? null,
        deferredDate:       serverTimestamp(),
        resolveCondition:   item.resolveCondition   ?? null,
        weeksDeferredCount: 0,
        lastCountedWeek:    thisWeek,
        status:             "active",
        addressedDate:      null,
        escalatedDate:      null,
      });
    }
  }
}

// ── resolveDeferred ──────────────────────────────────────────────────────────
// Sets status to 'resolved' and records addressedDate for any active or
// escalated document matching the given priority label.
export async function resolveDeferred(athleteUid, priorityLabel) {
  const [activeSnap, escalatedSnap] = await Promise.all([
    getDocs(query(col(athleteUid), where("priority", "==", priorityLabel), where("status", "==", "active"))),
    getDocs(query(col(athleteUid), where("priority", "==", priorityLabel), where("status", "==", "escalated"))),
  ]);

  const allDocs = [...activeSnap.docs, ...escalatedSnap.docs];
  for (const d of allDocs) {
    await updateDoc(doc(db, "athletes", athleteUid, "deferredPriorities", d.id), {
      status:        "resolved",
      addressedDate: serverTimestamp(),
    });
  }
}

// ── checkEscalations ─────────────────────────────────────────────────────────
// Promotes active items deferred 4+ weeks to 'escalated' (a write). This MUTATES,
// so its return value only reflects items it flipped on this call — do not rely
// on it for display (use refreshEscalations / getEscalated instead).
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

// ── getEscalated ─────────────────────────────────────────────────────────────
// Read-only: returns ALL currently-escalated items. Safe to call from any number
// of callers/effects without racing, since it never writes.
export async function getEscalated(athleteUid) {
  const snap = await getDocs(
    query(col(athleteUid), where("status", "==", "escalated"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── refreshEscalations ───────────────────────────────────────────────────────
// Promotes any newly-eligible items, then returns the FULL set of escalated
// items. Use this for display: regardless of which caller ran the promotion
// first, every caller sees the complete escalated set.
export async function refreshEscalations(athleteUid) {
  await checkEscalations(athleteUid);
  return getEscalated(athleteUid);
}
