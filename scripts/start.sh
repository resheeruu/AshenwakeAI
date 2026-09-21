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

# ---------- Resource Check (before Playwright) ----------

# Lightweight resource check: disk, RAM, CPU.
# Never crashes startup — always exits 0.
# Sourced (not executed) so ASHENAI_RESOURCE_DISK_STATE,
# ASHENAI_RESOURCE_RAM_STATE, ASHENAI_RESOURCE_CPU_STATE and
# ASHENAI_RESOURCE_DISK_FREE_MB propagate to ensure-playwright.sh.
# `set -a` auto-exports them for the child process.
export APP_DIR
set -a
# shellcheck source=check-resources.sh
. "$APP_DIR/scripts/check-resources.sh" || true
set +a

# ---------- Playwright Chromium (optional) ----------

# Chromium is optional — the application degrades gracefully when unavailable.
# We only install when ASHENAI_PLAYWRIGHT_BOOTSTRAP=1 and the binary is missing.
# Subsequent restarts never re-download if the binary already exists.
# Disk protection: installation is skipped if disk is critically low.

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
export PLAYWRIGHT_SKIP_BROWSER_GC="${PLAYWRIGHT_SKIP_BROWSER_GC:-1}"

bash "$APP_DIR/scripts/ensure-playwright.sh"

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
