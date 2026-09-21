#!/usr/bin/env bash
# ============================================================
# ensure-playwright.sh
#
# Ensures the Playwright Chromium browser is available without
# repeatedly downloading it. Designed for constrained hosting
# (e.g. small-quota Wispbyte servers) where every restart must be fast.
#
# STORAGE NOTE: container-visible `df` free space is NOT the hosting
# account/server quota. ENOSPC during the ~184 MB Chromium download
# can be caused by quota, overlay writable-layer limits, inode
# exhaustion, /tmp limits, or per-container limits even when `df`
# on APP_DIR looks large. This script never deletes arbitrary files
# to "fix" ENOSPC; it disables browser features and reports causes.
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

# Atomic lock using mkdir (works on all POSIX filesystems).
# LOCK_OWNED tracks whether THIS process created the lock, so concurrent
# contenders never delete each other's lock.
LOCK_OWNED=0
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    LOCK_OWNED=1
    return 0
  fi
  # Check if the lock is stale (older than 10 minutes).
  # NOTE: `find <dir> -mmin +10` prints the dir only when stale; it exits 0
  # in BOTH cases, so staleness must be decided from its OUTPUT, never from
  # `&&`/`||` chaining on the exit code.
  if [ -d "$LOCK_DIR" ]; then
    local found
    if command -v find >/dev/null 2>&1; then
      found=$(find "$LOCK_DIR" -maxdepth 0 -mmin +10 2>/dev/null || true)
      if [ -n "$found" ]; then
        log "Removing stale lock directory"
        rm -rf "$LOCK_DIR"
        if mkdir "$LOCK_DIR" 2>/dev/null; then
          LOCK_OWNED=1
          return 0
        fi
      fi
    fi
    log "Chromium bootstrap already in progress (lock exists). Skipping."
    return 1
  fi
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    LOCK_OWNED=1
    return 0
  fi
  return 1
}

release_lock() {
  if [ "$LOCK_OWNED" = "1" ]; then
    LOCK_OWNED=0
    rm -rf "$LOCK_DIR" 2>/dev/null || true
  fi
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

# ---------- Disk space check (container-visible only; NOT quota) ----------
# `df -P` reports 512-byte blocks (NOT 1K). Divide by 2048 for MB.

check_disk_space_mb() {
  local path="$1"
  [ -e "$path" ] || path=$(dirname "$path")
  local free_blocks
  free_blocks=$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $4}')
  echo $(( ${free_blocks:-0} / 2048 ))
}

# Minimum across all paths in the download pipeline. ENOSPC is
# decided by the most constrained filesystem, not by APP_DIR alone.
min_disk_space_mb() {
  local min=""
  local p free
  for p in "$@"; do
    [ -n "$p" ] || continue
    free=$(check_disk_space_mb "$p")
    if [ -z "$min" ] || [ "$free" -lt "$min" ]; then min="$free"; fi
  done
  echo "${min:-0}"
}

log_disk_details() {
  local label path free_blocks total_blocks free_mb total_mb ino_free ino_pct dev mnt
  for path in "$@"; do
    [ -n "$path" ] || continue
    if [ ! -e "$path" ]; then path=$(dirname "$path"); fi
    [ -e "$path" ] || { log "Disk detail: path=${path} (unavailable)"; continue; }
    # df -P reports 512-byte blocks (NOT 1K).
    free_blocks=$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $4}'); free_blocks=${free_blocks:-0}
    total_blocks=$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $2}'); total_blocks=${total_blocks:-0}
    free_mb=$(( free_blocks / 2048 )); total_mb=$(( total_blocks / 2048 ))
    dev=$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $1}'); dev=${dev:-unknown}
    mnt=$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $6}'); mnt=${mnt:-unknown}
    ino_free=$(df -i -P "$path" 2>/dev/null | awk 'NR==2 {print $4}'); ino_free=${ino_free:-unknown}
    ino_pct=$(df -i -P "$path" 2>/dev/null | awk 'NR==2 {print $5}'); ino_pct=${ino_pct:-unknown}
    log "Disk detail: path=${path} device=${dev} mount=${mnt} free=${free_mb}MB/${total_mb}MB inodes_free=${ino_free} (${ino_pct})"
  done
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
    return 0
  fi

  log "Chromium: missing"

  # --- Check: is bootstrap enabled? ---
  if [ "${ASHENAI_PLAYWRIGHT_BOOTSTRAP:-0}" != "1" ]; then
    log "Bootstrap not enabled (ASHENAI_PLAYWRIGHT_BOOTSTRAP=1 required). Browser features disabled."
    return 0
  fi

  log "Bootstrap permitted"

  # --- Check: did a previous install fail? ---
  if [ "$current_state" = "failed" ]; then
    if [ "${ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE:-0}" != "1" ]; then
      log "Previous installation failed. Set ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE=1 to retry."
      return 0
    fi
    log "Force retry enabled. Proceeding with installation."
  fi

  # --- Disk protection: check available space ---
  # check-resources.sh already probes all pipeline paths and exports
  # the conservative minimum; use it when available. Otherwise probe
  # the full download pipeline directly (browsers cache, npm cache,
  # TMPDIR, /tmp, APP_DIR) — never APP_DIR alone.
  local npm_cache_dir=""
  if command -v npm >/dev/null 2>&1; then
    npm_cache_dir=$(npm config get cache 2>/dev/null | tr -d '\r\n' || true)
  fi
  local tmp_dir="${TMPDIR:-/tmp}"
  local disk_free_mb="${ASHENAI_RESOURCE_DISK_FREE_MB:-0}"
  local disk_state="${ASHENAI_RESOURCE_DISK_STATE:-OK}"

  # If resource check didn't run or returned UNAVAILABLE, check directly
  if [ "$disk_state" = "UNAVAILABLE" ] || [ "$disk_free_mb" -eq 0 ]; then
    disk_free_mb=$(min_disk_space_mb "$APP_DIR" "$PLAYWRIGHT_BROWSERS_PATH" "$npm_cache_dir" "$tmp_dir" "/tmp")
    disk_state="OK"
  fi
  log_disk_details "$APP_DIR" "$PLAYWRIGHT_BROWSERS_PATH" "$npm_cache_dir" "$tmp_dir" "/tmp"

  if [ "$disk_state" = "CRITICAL" ] || [ "$disk_free_mb" -lt "$DISK_CRITICAL_MB" ]; then
    log "[CRITICAL] Disk free (container-visible minimum): ${disk_free_mb} MB (below ${DISK_CRITICAL_MB} MB threshold)"
    log "[ACTION] Chromium bootstrap skipped"
    log "[ACTION] Browser features disabled. HTTP pipeline remains active."
    log "NOTE: container-visible free space is NOT the hosting account/server quota."
    log "Actual Wispbyte storage quota could not be verified from inside the container."
    write_state "failed"
    return 0
  fi

  if [ "$disk_free_mb" -lt "$MIN_FREE_MB" ]; then
    log "[WARNING] Disk free (container-visible minimum): ${disk_free_mb} MB (below ${MIN_FREE_MB} MB recommended for Chromium)"
    log "[WARNING] Installation may fail due to insufficient space."
    log "NOTE: container-visible free space is NOT the hosting account/server quota."
  fi

  # --- Acquire lock ---
  # On contention, do NOT touch the rival's lock — just skip this attempt.
  if ! acquire_lock; then
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
    # Unsupported platform (e.g. Termux/Android): Playwright cannot
    # install Chromium at all. This is NOT a disk problem and must not
    # be reported as one; retrying will never succeed.
    if echo "$install_output" | grep -qi "Unsupported platform"; then
      log "[ACTION] Platform does not support Playwright Chromium installation."
      log "[ACTION] This is unrelated to disk space. HTTP pipeline remains active."
      write_state "unsupported"
      release_lock
      return 0
    fi
    # ENOSPC diagnosis: df free space is container-visible capacity,
    # NOT the hosting quota. List every candidate cause; do NOT claim
    # a single cause, and never delete arbitrary files.
    if echo "$install_output" | grep -qi "ENOSPC\|no space left on device"; then
      log "[CRITICAL] ENOSPC during Chromium download (~184 MB archive)."
      log "[CAUSES] Possible (in-container tools cannot distinguish these):"
      log "  - Wispbyte storage quota (account/server limit)"
      log "  - container filesystem quota / overlay writable-layer limit"
      log "  - inode exhaustion (check: df -i)"
      log "  - /tmp (tmpfs) limit — Playwright/tmp downloads may use /tmp"
      log "  - Playwright cache dir on constrained filesystem ($PLAYWRIGHT_BROWSERS_PATH)"
      log "  - npm cache dir on constrained filesystem"
      log "  - per-process/container limits imposed by the provider"
      log "NOTE: container-visible free space is NOT the hosting account/server quota."
      log "Actual Wispbyte storage quota could not be verified from inside the container."
      log "[ACTION] Browser features disabled. HTTP pipeline remains active."
      log "[ACTION] Check host panel quota/disk usage, then set ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE=1 to retry."
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
