// Data layer: Firestore in production, localStorage in demo mode (VITE_DEMO=1).
// Both implementations return the same shapes so App.jsx never branches.
import { db, DEMO } from "./firebase";
import {
  doc, getDoc, setDoc, addDoc, deleteDoc,
  collection, getDocs, query, orderBy, limit,
} from "firebase/firestore";

// ─── localStorage backend (demo) ─────────────────────────────────────────────
const lsKey = (uid, name) => `runplan.${uid}.${name}`;
const lsRead  = (uid, name, fallback) => {
  try { return JSON.parse(localStorage.getItem(lsKey(uid, name))) ?? fallback; }
  catch { return fallback; }
};
const lsWrite = (uid, name, value) =>
  localStorage.setItem(lsKey(uid, name), JSON.stringify(value));

let lsIdCounter = 0;
const lsId = () => `ls_${Date.now()}_${++lsIdCounter}`;

// ─── Profile ─────────────────────────────────────────────────────────────────
export async function loadProfile(uid) {
  if (DEMO) return lsRead(uid, "profile", null);
  const snap = await getDoc(doc(db, "runners", uid));
  return snap.exists() ? snap.data().profile || null : null;
}

export async function saveProfile(uid, profile) {
  if (DEMO) { lsWrite(uid, "profile", profile); return; }
  await setDoc(doc(db, "runners", uid), { profile }, { merge: true });
}

// ─── Health check-ins (one per day, date = id) ──────────────────────────────
export async function loadCheckins(uid, max = 14) {
  if (DEMO) {
    return lsRead(uid, "healthCheckins", [])
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, max);
  }
  const snap = await getDocs(query(
    collection(db, "runners", uid, "healthCheckins"),
    orderBy("date", "desc"), limit(max),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveCheckin(uid, checkin) {
  // Upsert by date — re-submitting or a WHOOP sync merges into the same day.
  if (DEMO) {
    const all = lsRead(uid, "healthCheckins", []);
    const idx = all.findIndex(c => c.date === checkin.date);
    if (idx >= 0) all[idx] = { ...all[idx], ...checkin };
    else all.push({ id: checkin.date, ...checkin });
    lsWrite(uid, "healthCheckins", all);
    return;
  }
  await setDoc(doc(db, "runners", uid, "healthCheckins", checkin.date), checkin, { merge: true });
}

// ─── Run logs ────────────────────────────────────────────────────────────────
export async function loadRuns(uid, max = 40) {
  if (DEMO) {
    return lsRead(uid, "runLogs", [])
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, max);
  }
  const snap = await getDocs(query(
    collection(db, "runners", uid, "runLogs"),
    orderBy("date", "desc"), limit(max),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addRun(uid, run) {
  if (DEMO) {
    const all = lsRead(uid, "runLogs", []);
    const withId = { id: lsId(), ...run };
    all.push(withId);
    lsWrite(uid, "runLogs", all);
    return withId;
  }
  const ref = await addDoc(collection(db, "runners", uid, "runLogs"), run);
  return { id: ref.id, ...run };
}

export async function deleteRun(uid, runId) {
  if (DEMO) {
    lsWrite(uid, "runLogs", lsRead(uid, "runLogs", []).filter(r => r.id !== runId));
    return;
  }
  await deleteDoc(doc(db, "runners", uid, "runLogs", runId));
}

// ─── Weekly plan ─────────────────────────────────────────────────────────────
export async function loadPlan(uid) {
  if (DEMO) return lsRead(uid, "planCurrent", null);
  const snap = await getDoc(doc(db, "runners", uid, "plans", "current"));
  return snap.exists() ? snap.data() : null;
}

export async function savePlan(uid, plan) {
  if (DEMO) { lsWrite(uid, "planCurrent", plan); return; }
  await setDoc(doc(db, "runners", uid, "plans", "current"), plan);
}

// ─── Integration tokens (Strava / WHOOP) ────────────────────────────────────
export async function loadIntegration(uid, name) {
  if (DEMO) return lsRead(uid, `integration.${name}`, null);
  const snap = await getDoc(doc(db, "runners", uid, "integrations", name));
  return snap.exists() ? snap.data() : null;
}

export async function saveIntegration(uid, name, tokens) {
  if (DEMO) { lsWrite(uid, `integration.${name}`, tokens); return; }
  await setDoc(doc(db, "runners", uid, "integrations", name), tokens);
}
