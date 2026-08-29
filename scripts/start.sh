#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# AshenAI Generic Startup Script
# Hosting-agnostic: works on Render, Docker, Railway, Fly.io,
# Koyeb, VPS, Termux, and any generic Node.js environment.
#
# If Lavalink files exist AND java is available, Lavalink is
# started alongside AshenAI. Otherwise AshenAI starts alone
# and music is gracefully degraded.
# ============================================================

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LAVALINK_DIR="${APP_DIR}/lavalink"
LAVALINK_JAR="${LAVALINK_DIR}/Lavalink.jar"
LAVALINK_HOST="${LAVALINK_HOST:-127.0.0.1}"
LAVALINK_PORT="${LAVALINK_PORT:-2333}"
LAVALINK_WAIT_TIMEOUT="${LAVALINK_WAIT_TIMEOUT:-120}"
PORT="${PORT:-3000}"
LAVALINK_PID=""
ASHENAI_PID=""

HAS_JAVA=false
HAS_LAVALINK=false
START_LAVALINK=false

# ---------- Detect optional capabilities ----------

if command -v java >/dev/null 2>&1; then
  HAS_JAVA=true
fi

if [ -f "$LAVALINK_JAR" ] && [ -f "${LAVALINK_DIR}/application.yml" ]; then
  HAS_LAVALINK=true
fi

if [ "$HAS_JAVA" = true ] && [ "$HAS_LAVALINK" = true ]; then
  START_LAVALINK=true
fi

# ---------- Cleanup on exit ----------

cleanup() {
  echo "[start] Shutting down..."
  if [ -n "$LAVALINK_PID" ] && kill -0 "$LAVALINK_PID" 2>/dev/null; then
    kill -TERM "$LAVALINK_PID" 2>/dev/null || true
    wait "$LAVALINK_PID" 2>/dev/null || true
  fi
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
echo "[start] Java: ${HAS_JAVA}"
echo "[start] Lavalink files: ${HAS_LAVALINK}"
echo "[start] Will start Lavalink: ${START_LAVALINK}"

if command -v ffmpeg >/dev/null 2>&1; then
  echo "[start] FFmpeg: available"
else
  echo "[start] FFmpeg: not found (music encoding may be limited)"
fi

# ---------- Start Lavalink (if available) ----------

start_lavalink() {
  cd "$LAVALINK_DIR"
  java -jar "$LAVALINK_JAR" &
  LAVALINK_PID=$!
  cd "$APP_DIR"
  echo "[start] Lavalink started (PID $LAVALINK_PID) on ${LAVALINK_HOST}:${LAVALINK_PORT}"
}

wait_for_lavalink() {
  local elapsed=0
  local url="http://${LAVALINK_HOST}:${LAVALINK_PORT}/version"
  local auth_header="Authorization: ${LAVALINK_PASSWORD:-}"

  while [ "$elapsed" -lt "$LAVALINK_WAIT_TIMEOUT" ]; do
    if ! kill -0 "$LAVALINK_PID" 2>/dev/null; then
      echo "[start] ERROR: Lavalink process exited prematurely."
      return 1
    fi

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "$auth_header" "$url" 2>/dev/null) || http_code="000"

    if [ "$http_code" = "200" ]; then
      echo "[start] Lavalink is ready after ${elapsed}s"
      return 0
    fi

    if [ $((elapsed % 10)) -eq 0 ] && [ "$elapsed" -gt 0 ]; then
      echo "[start] Waiting for Lavalink... (${elapsed}/${LAVALINK_WAIT_TIMEOUT}s)"
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "[start] WARNING: Lavalink failed to respond after ${LAVALINK_WAIT_TIMEOUT}s."
  echo "[start] Music features will be unavailable. Continuing without Lavalink."
  return 1
}

if [ "$START_LAVALINK" = true ]; then
  start_lavalink
  echo "[start] Waiting for Lavalink (${LAVALINK_WAIT_TIMEOUT}s timeout)..."
  if ! wait_for_lavalink; then
    echo "[start] Killing Lavalink (PID $LAVALINK_PID)..."
    kill -TERM "$LAVALINK_PID" 2>/dev/null || true
    wait "$LAVALINK_PID" 2>/dev/null || true
    LAVALINK_PID=""
    echo "[start] Continuing without Lavalink."
  fi
fi

# ---------- Start AshenAI ----------

echo "[start] Starting AshenAI on port $PORT..."
cd "$APP_DIR"

# Use node --import tsx if available, otherwise use tsx directly
if command -v node >/dev/null 2>&1; then
  node --import tsx src/index.ts &
else
  echo "[start] ERROR: node not found."
  exit 1
fi

ASHENAI_PID=$!
echo "[start] AshenAI started (PID $ASHENAI_PID)"

# ---------- Monitor ----------

if [ "$START_LAVALINK" = true ] && [ -n "$LAVALINK_PID" ]; then
  while kill -0 "$ASHENAI_PID" 2>/dev/null; do
    if ! kill -0 "$LAVALINK_PID" 2>/dev/null; then
      echo "[start] Lavalink died. Restarting..."
      start_lavalink
      if ! wait_for_lavalink; then
        echo "[start] Lavalink restart failed. AshenAI will lose music."
      fi
    fi
    sleep 5
  done
else
  wait "$ASHENAI_PID" 2>/dev/null
fi

EXIT_CODE=$?
echo "[start] AshenAI exited with code $EXIT_CODE."

# ---------- Stop Lavalink ----------

if [ -n "$LAVALINK_PID" ] && kill -0 "$LAVALINK_PID" 2>/dev/null; then
  echo "[start] Stopping Lavalink (PID $LAVALINK_PID)..."
  kill -TERM "$LAVALINK_PID" 2>/dev/null || true
  wait "$LAVALINK_PID" 2>/dev/null || true
fi

exit "$EXIT_CODE"
