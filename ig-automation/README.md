# IG Content Automation

Fully automated Instagram content pipeline. Drop raw photos/videos into a Google Drive folder — get back edited, IG-ready media with AI-generated captions and hashtags.

## How It Works

```
📥 Inbox/        ← you drop raw photos & videos here
⚙️ Processing/   ← file moves here while being worked on
✅ Ready/        ← edited media + caption .txt appear here (ready to post!)
📦 Archive/      ← your originals are kept here
❌ Errors/       ← anything that failed, with an error log
```

The service polls the Inbox every 30 seconds and for each file:

**Photos** → filter preset (warm/cool/vibrant/matte/natural) → auto-enhance → crop to the best IG ratio (1:1, 4:5, or 9:16) → optional text overlay → high-quality JPEG.

**Videos** → trim to max 90s → resize/pad to IG resolution (1080×1920 Reels, 1080×1080 square, 1080×1350 portrait) → mix in background music from your `music/` folder → burn caption text → H.264 MP4 with faststart.

**Captions** → Claude analyzes the image (or the video's first frame) and writes a motivational tennis-brand caption plus 25 hashtags, saved as `<name>_caption.txt` next to the processed file.

## Setup

### 1. Google Drive
Create 5 folders in your Drive (e.g. under "IG Automation"): `Inbox`, `Processing`, `Ready`, `Archive`, `Errors`. Copy each folder's ID from its URL (`https://drive.google.com/drive/folders/<ID>`).

### 2. Google Service Account
1. In [GCP Console](https://console.cloud.google.com) → create/select a project → enable the **Google Drive API**.
2. IAM → Service Accounts → Create (`ig-automation-sa`).
3. Keys → Add Key → JSON → download.
4. **Share all 5 Drive folders** with the service account's email (Editor access).

### 3. Configure
```bash
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, the 5 folder IDs, and either
# GOOGLE_SERVICE_ACCOUNT_JSON (paste the JSON) or GOOGLE_SERVICE_ACCOUNT_PATH
```

### 4. Music (optional)
Drop licensed `.mp3` tracks into `music/`. One is mixed under every video at 30% volume (`MUSIC_VOLUME`). **Use only music you have rights to post on Instagram.**

### 5. Run locally
```bash
npm install
npm start
```
Drop a photo in the Inbox folder and watch the logs.

## Deploy to Google Cloud Run (24/7)

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

# secrets
gcloud secrets create ig-anthropic-key --data-file=- <<< "$ANTHROPIC_API_KEY"
gcloud secrets create ig-sa-key --data-file=service-account.json

# build & deploy
gcloud builds submit --tag us-central1-docker.pkg.dev/$PROJECT/ig-automation/app:latest .
gcloud run deploy ig-automation \
  --image us-central1-docker.pkg.dev/$PROJECT/ig-automation/app:latest \
  --region us-central1 --no-allow-unauthenticated \
  --min-instances 1 --max-instances 1 \
  --memory 2Gi --cpu 2 --timeout 3600 \
  --set-secrets "ANTHROPIC_API_KEY=ig-anthropic-key:latest,GOOGLE_SERVICE_ACCOUNT_JSON=ig-sa-key:latest" \
  --set-env-vars "DRIVE_INBOX_FOLDER_ID=...,DRIVE_PROCESSING_FOLDER_ID=...,DRIVE_READY_FOLDER_ID=...,DRIVE_ARCHIVE_FOLDER_ID=...,DRIVE_ERRORS_FOLDER_ID=...,DEFAULT_IMAGE_FILTER=natural,NODE_ENV=production"
```

Key flags: `--min-instances 1` keeps the poller always on; `--max-instances 1` prevents two workers racing on the same files.

## Configuration Reference

| Env var | Default | Purpose |
|---|---|---|
| `POLL_INTERVAL_MS` | 30000 | How often to check the Inbox |
| `MAX_CONCURRENT_JOBS` | 2 | Parallel file processing limit |
| `MAX_VIDEO_DURATION_SEC` | 90 | Videos are trimmed to this length |
| `DEFAULT_IMAGE_FILTER` | natural | warm / cool / vibrant / matte / natural |
| `MUSIC_VOLUME` | 0.3 | Background music level (0–1) |
| `ANTHROPIC_MODEL` | claude-haiku-4-5 | Vision model for captions |

## Posting to Instagram

This pipeline prepares content; posting is manual by design (download from Ready → post). To fully automate posting, you'd connect the [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/) (requires an IG Business account + Facebook App) — the processed files and captions in Ready are already in the exact format the API needs.
