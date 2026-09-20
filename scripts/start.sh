#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# AshenAI Generic Startup Script
# Hosting-agnostic: works on Render, Docker, Railway, Fly.io,
# Koyeb, VPS, Termux, and any generic Node.js environment.
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

# ---------- Playwright Chromium (optional) ----------

# Chromium is optional — the application degrades gracefully when unavailable.
# We only install when missing to save time and bandwidth on restart.
ensure_chromium() {
  # Fast skip: if playwright module isn't available, nothing to do.
  if ! node -e "require('playwright')" 2>/dev/null; then
    echo "[start] Playwright not installed; browser features disabled."
    return 0
  fi

  # Check whether Chromium binary already exists using Playwright's own detection.
  # This avoids hardcoding any cache path (e.g. /home/container/.cache/ms-playwright).
  if node -e "
    const { chromium } = require('playwright');
    const path = chromium.executablePath();
    const fs = require('fs');
    if (path && fs.existsSync(path)) { process.exit(0); }
    process.exit(1);
  " 2>/dev/null; then
    echo "[start] Playwright Chromium already installed."
    return 0
  fi

  echo "[start] Playwright Chromium missing; installing..."
  local install_output
  local rc=0
  install_output=$(npx playwright install chromium 2>&1) || rc=$?
  echo "$install_output"

  if [ "$rc" -eq 0 ]; then
    echo "[start] Playwright Chromium installed."
    return 0
  fi

  # Installation failed — log clearly but do not block startup.
  echo "[start] WARNING: Playwright Chromium installation failed (exit $rc)."
  echo "[start] Browser features will be disabled. HTTP pipeline remains active."
  return 0
}

ensure_chromium

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
