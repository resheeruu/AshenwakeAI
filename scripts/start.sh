#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# AshenAI Generic Startup Script
# Hosting-agnostic: works on Render, Docker, Railway, Fly.io,
# Koyeb, VPS, Termux, and any generic Node.js environment.
#
# Music runs entirely via Node.js (discord-player).
# No Java or Lavalink required.
# ============================================================

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
ASHENAI_PID=""

# ---------- Cleanup on exit ----------

cleanup() {
  echo "[start] Shutting down..."
  if [ -n "$ASHENAI_PID" ] && kill -0 "$ASHENAI_PID" 2>/dev/null; then
    kill -TERM "$ASHENAI_PID" 2>/dev/null || true
    wait "$ASHENAI_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  echo "[start] Shutdown complete."
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

# ---------- Log environment (no secrets) ----------

echo "[start] AshenAI Generic Startup"
echo "[start] NODE_ENV=${NODE_ENV:-not set}"
echo "[start] PORT=${PORT}"

if command -v ffmpeg >/dev/null 2>&1; then
  echo "[start] FFmpeg: available"
else
  echo "[start] FFmpeg: not found (music encoding may be limited)"
fi

# ---------- Start AshenAI ----------

echo "[start] Starting AshenAI on port $PORT..."
cd "$APP_DIR"

if command -v node >/dev/null 2>&1; then
  node --import tsx src/index.ts &
else
  echo "[start] ERROR: node not found."
  exit 1
fi

ASHENAI_PID=$!
echo "[start] AshenAI started (PID $ASHENAI_PID)"

# ---------- Monitor ----------

wait "$ASHENAI_PID" 2>/dev/null

EXIT_CODE=$?
echo "[start] AshenAI exited with code $EXIT_CODE."

exit "$EXIT_CODE"
