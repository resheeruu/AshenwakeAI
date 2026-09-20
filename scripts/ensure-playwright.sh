#!/usr/bin/env bash
# ============================================================
# ensure-playwright.sh
#
# Ensures the Playwright Chromium browser is available without
# repeatedly downloading it. Designed for constrained 1 GB
# Wispbyte environments where every restart must be fast.
#
# Behaviour:
#   - If Chromium exists and is executable → exit 0, no download
#   - If missing and ASHENAI_PLAYWRIGHT_BOOTSTRAP=1 → install
#   - If missing and bootstrap not enabled → exit 0, browser
#     features gracefully disable in the app
#   - If a previous install failed → require explicit FORCE
#   - If disk is critically low → skip installation entirely
# ============================================================

set -euo pipefail

# ---------- Configuration ----------

PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
export PLAYWRIGHT_BROWSERS_PATH

PLAYWRIGHT_SKIP_BROWSER_GC="${PLAYWRIGHT_SKIP_BROWSER_GC:-1}"
export PLAYWRIGHT_SKIP_BROWSER_GC

BOOTSTRAP_STATE_DIR="$HOME/.ashenai"
BOOTSTRAP_STATE_FILE="$BOOTSTRAP_STATE_DIR/bootstrap-state"
LOCK_DIR="$HOME/.ashenai/.playwright-install.lock"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Minimum free disk in MB required for Chromium installation
# Archive download: ~184 MiB, extraction overhead: ~150 MiB,
# runtime cache: ~100 MiB, safety margin: ~66 MiB
MIN_FREE_MB="${ASHENAI_PLAYWRIGHT_MIN_FREE_MB:-500}"

# Critical disk threshold: below this, installation is blocked entirely
DISK_CRITICAL_MB="${ASHENAI_RESOURCE_DISK_CRITICAL_MB:-50}"

# ---------- Helpers ----------

log() {
  echo "[PLAYWRIGHT] $*"
}

ensure_dirs() {
  mkdir -p "$PLAYWRIGHT_BROWSERS_PATH" "$BOOTSTRAP_STATE_DIR"
}

# Atomic lock using mkdir (works on all POSIX filesystems)
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    return 0
  fi
  # Check if the lock is stale (older than 10 minutes)
  if [ -d "$LOCK_DIR" ]; then
    local lock_age
    if command -v find >/dev/null 2>&1; then
      lock_age=$(find "$LOCK_DIR" -maxdepth 0 -mmin +10 2>/dev/null && echo "stale" || echo "fresh")
      if [ "$lock_age" = "stale" ]; then
        log "Removing stale lock directory"
        rm -rf "$LOCK_DIR"
        mkdir "$LOCK_DIR" && return 0
      fi
    fi
    log "Chromium bootstrap already in progress (lock exists). Skipping."
    return 1
  fi
  mkdir "$LOCK_DIR" && return 0
}

release_lock() {
  rm -rf "$LOCK_DIR" 2>/dev/null || true
}

write_state() {
  local state="$1"
  mkdir -p "$BOOTSTRAP_STATE_DIR"
  echo "$state" > "$BOOTSTRAP_STATE_FILE"
}

read_state() {
  if [ -f "$BOOTSTRAP_STATE_FILE" ]; then
    cat "$BOOTSTRAP_STATE_FILE" 2>/dev/null || echo "unknown"
  else
    echo "none"
  fi
}

# ---------- Detect Chromium executable ----------

detect_chromium() {
  # Use Playwright's own resolution to find the executable.
  # This respects PLAYWRIGHT_BROWSERS_PATH.
  node -e "
    const { chromium } = require('playwright');
    const path = chromium.executablePath();
    if (!path) { process.exit(1); }
    const fs = require('fs');
    try {
      fs.accessSync(path, fs.constants.X_OK);
      process.stdout.write(path);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  " 2>/dev/null
}

# ---------- Disk space check ----------

check_disk_space_mb() {
  local path="${1:-.}"
  local free_kb
  free_kb=$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $4}')
  echo $(( ${free_kb:-0} / 1024 ))
}

# ---------- Main logic ----------

main() {
  ensure_dirs

  local current_state
  current_state=$(read_state)

  # --- Check: is it already installed? ---
  local chromium_path
  if chromium_path=$(detect_chromium); then
    log "Chromium: installed ($chromium_path)"
    write_state "ready"
    release_lock
    return 0
  fi

  log "Chromium: missing"

  # --- Check: is bootstrap enabled? ---
  if [ "${ASHENAI_PLAYWRIGHT_BOOTSTRAP:-0}" != "1" ]; then
    log "Bootstrap not enabled (ASHENAI_PLAYWRIGHT_BOOTSTRAP=1 required). Browser features disabled."
    release_lock
    return 0
  fi

  log "Bootstrap permitted"

  # --- Check: did a previous install fail? ---
  if [ "$current_state" = "failed" ]; then
    if [ "${ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE:-0}" != "1" ]; then
      log "Previous installation failed. Set ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE=1 to retry."
      release_lock
      return 0
    fi
    log "Force retry enabled. Proceeding with installation."
  fi

  # --- Disk protection: check available space ---
  # Use the resource check result if available, otherwise check directly
  local disk_free_mb="${ASHENAI_RESOURCE_DISK_FREE_MB:-0}"
  local disk_state="${ASHENAI_RESOURCE_DISK_STATE:-OK}"

  # If resource check didn't run or returned UNAVAILABLE, check directly
  if [ "$disk_state" = "UNAVAILABLE" ] || [ "$disk_free_mb" -eq 0 ]; then
    disk_free_mb=$(check_disk_space_mb "$APP_DIR")
  fi

  if [ "$disk_state" = "CRITICAL" ] || [ "$disk_free_mb" -lt "$DISK_CRITICAL_MB" ]; then
    log "[CRITICAL] Disk free: ${disk_free_mb} MB (below ${DISK_CRITICAL_MB} MB threshold)"
    log "[ACTION] Chromium bootstrap skipped"
    log "[ACTION] Browser features disabled. HTTP pipeline remains active."
    write_state "failed"
    release_lock
    return 0
  fi

  if [ "$disk_free_mb" -lt "$MIN_FREE_MB" ]; then
    log "[WARNING] Disk free: ${disk_free_mb} MB (below ${MIN_FREE_MB} MB recommended for Chromium)"
    log "[WARNING] Installation may fail due to insufficient space."
  fi

  # --- Acquire lock ---
  if ! acquire_lock; then
    release_lock
    return 0
  fi

  # --- Install ---
  log "Installing Chromium (--no-shell --no-remove)..."
  write_state "installing"

  local install_output
  local rc=0
  install_output=$(npx --no-install playwright install chromium --no-shell --no-remove 2>&1) || rc=$?

  if [ "$rc" -ne 0 ]; then
    log "Installation failed (exit $rc). Browser features will be disabled."
    # Check if it was an ENOSPC error
    if echo "$install_output" | grep -qi "ENOSPC\|no space left on device"; then
      log "[CRITICAL] ENOSPC during Chromium download."
      log "[ACTION] Browser features disabled. Free disk space and set ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE=1 to retry."
    fi
    write_state "failed"
    release_lock
    return 0
  fi

  # --- Verify installation ---
  local new_chromium_path
  if new_chromium_path=$(detect_chromium); then
    log "Chromium: ready ($new_chromium_path)"
    write_state "ready"
  else
    log "Installation succeeded but executable not found. Marking as failed."
    write_state "failed"
  fi

  release_lock
}

trap release_lock EXIT

main
