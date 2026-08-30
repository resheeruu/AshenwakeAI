#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# AshenAI Render Startup Script
# Starts AshenAI directly on Render.
# ============================================================

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-10000}"
ASHENAI_PID=""

cleanup() {
  echo "[render-start] Shutting down..."
  if [ -n "$ASHENAI_PID" ] && kill -0 "$ASHENAI_PID" 2>/dev/null; then
    kill -TERM "$ASHENAI_PID" 2>/dev/null || true
    wait "$ASHENAI_PID" 2>/dev/null || true
  fi
  jobs -p 2>/dev/null | xargs -r kill -TERM 2>/dev/null || true
  wait 2>/dev/null || true
  echo "[render-start] Shutdown complete."
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

# ---------- Start AshenAI ----------
echo "[render-start] Starting AshenAI on port $PORT..."
cd "$APP_DIR"
node --import tsx src/index.ts &
ASHENAI_PID=$!
echo "[render-start] AshenAI started (PID $ASHENAI_PID)"

# ---------- Keep alive ----------
wait "$ASHENAI_PID" 2>/dev/null
EXIT_CODE=$?

echo "[render-start] AshenAI exited with code $EXIT_CODE."

exit "$EXIT_CODE"
