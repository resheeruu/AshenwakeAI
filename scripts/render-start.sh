#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# AshenAI Combined Render Startup
# Starts Lavalink + AshenAI in a single Render container.
# ============================================================

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LAVALINK_DIR="${APP_DIR}/lavalink"
LAVALINK_JAR="${LAVALINK_DIR}/Lavalink.jar"
LAVALINK_HOST="${LAVALINK_HOST:-127.0.0.1}"
LAVALINK_PORT="${LAVALINK_PORT:-2333}"
LAVALINK_WAIT_TIMEOUT="${LAVALINK_WAIT_TIMEOUT:-120}"
PORT="${PORT:-10000}"
LAVALINK_PID=""

cleanup() {
  echo "[render-start] Shutting down..."
  if [ -n "$LAVALINK_PID" ] && kill -0 "$LAVALINK_PID" 2>/dev/null; then
    kill -TERM "$LAVALINK_PID" 2>/dev/null || true
    wait "$LAVALINK_PID" 2>/dev/null || true
  fi
  jobs -p 2>/dev/null | xargs -r kill -TERM 2>/dev/null || true
  wait 2>/dev/null || true
  echo "[render-start] Shutdown complete."
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

# ---------- FFmpeg check ----------
if command -v ffmpeg >/dev/null 2>&1; then
  echo "[render-start] FFmpeg: $(ffmpeg -version 2>&1 | head -1)"
else
  echo "[render-start] WARNING: FFmpeg not found"
fi

# ---------- Java check ----------
if ! command -v java >/dev/null 2>&1; then
  echo "[render-start] ERROR: Java not found. Lavalink requires Java 21+."
  exit 1
fi
echo "[render-start] Java: $(java -version 2>&1 | head -1)"

# ---------- Validate Lavalink files ----------
if [ ! -f "$LAVALINK_JAR" ]; then
  echo "[render-start] ERROR: Lavalink JAR not found at $LAVALINK_JAR"
  exit 1
fi

if [ ! -f "${LAVALINK_DIR}/application.yml" ]; then
  echo "[render-start] ERROR: application.yml not found at ${LAVALINK_DIR}/application.yml"
  exit 1
fi

start_lavalink() {
  cd "$LAVALINK_DIR"
  java -jar "$LAVALINK_JAR" &
  LAVALINK_PID=$!
  cd "$APP_DIR"
  echo "[render-start] Lavalink started (PID $LAVALINK_PID) on ${LAVALINK_HOST}:${LAVALINK_PORT}"
}

wait_for_lavalink() {
  local elapsed=0
  local url="http://${LAVALINK_HOST}:${LAVALINK_PORT}/version"
  echo "[render-start] Polling $url ..."

  while [ "$elapsed" -lt "$LAVALINK_WAIT_TIMEOUT" ]; do
    if ! kill -0 "$LAVALINK_PID" 2>/dev/null; then
      echo "[render-start] ERROR: Lavalink process (PID $LAVALINK_PID) exited prematurely."
      return 1
    fi

    if curl -sf "$url" >/dev/null 2>&1; then
      echo "[render-start] Lavalink is ready after ${elapsed}s"
      return 0
    fi

    if [ $((elapsed % 10)) -eq 0 ] && [ "$elapsed" -gt 0 ]; then
      echo "[render-start] Still waiting for Lavalink... (${elapsed}/${LAVALINK_WAIT_TIMEOUT}s)"
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "[render-start] ERROR: Lavalink failed to respond after ${LAVALINK_WAIT_TIMEOUT}s."
  echo "[render-start] Diagnostics:"
  echo "  - Lavalink PID: $LAVALINK_PID"
  echo "  - Process alive: $(kill -0 "$LAVALINK_PID" 2>/dev/null && echo yes || echo no)"
  echo "  - curl exit: $(curl -sf "$url" 2>&1; echo $?)"
  return 1
}

# ---------- Start Lavalink ----------
start_lavalink

echo "[render-start] Waiting for Lavalink (${LAVALINK_WAIT_TIMEOUT}s timeout)..."
if ! wait_for_lavalink; then
  echo "[render-start] Killing Lavalink (PID $LAVALINK_PID)..."
  kill -TERM "$LAVALINK_PID" 2>/dev/null || true
  wait "$LAVALINK_PID" 2>/dev/null || true
  exit 1
fi

# ---------- Start AshenAI ----------
echo "[render-start] Starting AshenAI on port $PORT..."
cd "$APP_DIR"
node --import tsx src/index.ts &
ASHENAI_PID=$!
echo "[render-start] AshenAI started (PID $ASHENAI_PID)"

# ---------- Keep alive + monitor Lavalink ----------
while kill -0 "$ASHENAI_PID" 2>/dev/null; do
  if ! kill -0 "$LAVALINK_PID" 2>/dev/null; then
    echo "[render-start] Lavalink died. Restarting..."
    start_lavalink
    if ! wait_for_lavalink; then
      echo "[render-start] ERROR: Lavalink restart failed. AshenAI will lose music."
    fi
  fi
  sleep 5
done

wait "$ASHENAI_PID" 2>/dev/null
EXIT_CODE=$?

echo "[render-start] AshenAI exited with code $EXIT_CODE."

# ---------- Stop Lavalink ----------
if kill -0 "$LAVALINK_PID" 2>/dev/null; then
  echo "[render-start] Stopping Lavalink (PID $LAVALINK_PID)..."
  kill -TERM "$LAVALINK_PID" 2>/dev/null || true
  wait "$LAVALINK_PID" 2>/dev/null || true
fi

exit "$EXIT_CODE"
