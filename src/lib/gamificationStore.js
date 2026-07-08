import { doc, setDoc, increment } from "firebase/firestore";
import { db } from "../firebase.js";

// Adds XP to athletes/{id}/gamification/state, creating the doc on first award.
export async function awardXp(athleteId, amount) {
  if (!athleteId || !amount) return;
  await setDoc(
    doc(db, "athletes", athleteId, "gamification", "state"),
    { xp: increment(amount) },
    { merge: true }
  );
}
