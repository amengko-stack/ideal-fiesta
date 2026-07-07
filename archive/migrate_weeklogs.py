"""
Migration script: move Valissa's weekLogs data
from auto-created athlete document to the correct one.

FROM: athletes/5G2KLPRpHHnySLMyYRrL
TO:   athletes/kDybMQH9lefwHI0dRway

Run from your project root:
  pip install firebase-admin
  python migrate_weeklogs.py
"""

import firebase_admin
from firebase_admin import credentials, firestore

# ── CONFIG ─────────────────────────────────────────────────────────────────
SERVICE_ACCOUNT_PATH = "serviceAccountKey.json"  # download from Firebase Console
FROM_ATHLETE_ID = "5G2KLPRpHHnySLMyYRrL"
TO_ATHLETE_ID   = "kDybMQH9lefwHI0dRway"
COLLECTIONS     = ["weekLogs"]
# ───────────────────────────────────────────────────────────────────────────

def migrate():
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    for col_name in COLLECTIONS:
        from_ref = db.collection("athletes").document(FROM_ATHLETE_ID).collection(col_name)
        to_ref   = db.collection("athletes").document(TO_ATHLETE_ID).collection(col_name)

        docs = from_ref.stream()
        moved = 0
        skipped = 0

        print(f"\n--- Migrating {col_name} ---")

        for doc in docs:
            data = doc.to_dict()

            # Check if document already exists in destination
            existing = to_ref.document(doc.id).get()
            if existing.exists:
                print(f"  SKIP (already exists): {doc.id}")
                skipped += 1
                continue

            # Write to destination with same document ID
            to_ref.document(doc.id).set(data)
            print(f"  MOVED: {doc.id} — {data.get('date', data.get('time', 'no date'))}")
            moved += 1

        print(f"  → {moved} moved, {skipped} skipped")

    print("\n✅ Migration complete.")
    print(f"Verify data at: athletes/{TO_ATHLETE_ID}/weekLogs")
    print(f"Then manually delete: athletes/{FROM_ATHLETE_ID}/weekLogs")
    print("DO NOT delete the FROM athlete document until you confirm the data moved correctly.")

if __name__ == "__main__":
    migrate()
