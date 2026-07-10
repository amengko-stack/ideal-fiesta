# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libvips-dev \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM node:22-slim AS app
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY fonts ./fonts

# music/ directory — add licensed .mp3 tracks before building for music mixing
# If MUSIC_DIR points elsewhere (e.g. a mounted volume), this directory is unused.
RUN mkdir -p /app/music

EXPOSE 8080

RUN useradd -m -u 1001 appuser
USER appuser

CMD ["node", "src/index.js"]
