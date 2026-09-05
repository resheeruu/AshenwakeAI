#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# AshenAI Wispbyte Deployment Startup
#
# Sequence:
#   1. Verify runtime prerequisites (node, npm)
#   2. Verify git repository
#   3. Safely synchronize main (ff-only)
#   4. Install dependencies (npm ci with lifecycle scripts)
#   5. Prepare Playwright Chromium (only if missing)
#   6. Runtime verification
#   7. Start AshenAI
#
# If any required step fails: STOP, non-zero exit, no bot start.
# ============================================================

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${ASHENAI_BRANCH:-main}"
cd "$APP_DIR" || { echo "[Wispbyte] FATAL: Cannot cd to $APP_DIR"; exit 1; }

# ============================================================
# Step 1: Runtime prerequisites
# ============================================================

echo "[Wispbyte] Checking runtime prerequisites..."

if ! command -v node >/dev/null 2>&1; then
  echo "[Wispbyte] FATAL: node not found."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[Wispbyte] FATAL: npm not found."
  exit 1
fi

echo "[Wispbyte] node=$(node --version) npm=$(npm --version)"

# ============================================================
# Step 2: Verify git repository
# ============================================================

if [ ! -d ".git" ]; then
  echo "[Wispbyte] FATAL: .git directory not found."
  exit 1
fi

# ============================================================
# Step 3: Git synchronization
# ============================================================

echo "[Wispbyte] Syncing repository..."

# Detect tracked-file changes ONLY (ignores untracked files/directories).
# Untracked runtime artifacts (.npm/, backups/, core.*, etc.) are expected
# and must NOT block deployment.
# Uses git diff (unstaged) and git diff --cached (staged) which only
# report modifications, deletions, and renames of TRACKED files.
TRACKED_UNSTAGED="$(git diff --name-only 2>/dev/null || true)"
TRACKED_STAGED="$(git diff --cached --name-only 2>/dev/null || true)"

if [ -n "$TRACKED_UNSTAGED" ] || [ -n "$TRACKED_STAGED" ]; then
  # Combine both lists
  ALL_TRACKED_DIRTY="$(printf '%s\n%s\n' "$TRACKED_UNSTAGED" "$TRACKED_STAGED" | grep -v '^$' || true)"

  # Check if ONLY package-lock.json is modified (hosting platform artifact)
  NON_LOCK_DIRTY="$(echo "$ALL_TRACKED_DIRTY" | grep -v '^package-lock\.json$' || true)"

  if [ -n "$NON_LOCK_DIRTY" ]; then
    echo "[Wispbyte] ERROR: Unexpected tracked file modifications detected:"
    echo "$NON_LOCK_DIRTY" | head -10
    echo "[Wispbyte] Refusing to start with dirty source tree."
    exit 1
  fi

  echo "[Wispbyte] Restoring package-lock.json (hosting artifact)..."
  git checkout -- package-lock.json 2>/dev/null || true
fi

# Fast-forward-only pull
if ! git pull --quiet --ff-only origin "$BRANCH" 2>&1; then
  echo "[Wispbyte] ERROR: git pull --ff-only failed."
  echo "[Wispbyte] Cannot synchronize repository. AshenAI will NOT start."
  exit 1
fi

SYNCHED_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "[Wispbyte] Repository synchronized: $SYNCHED_SHA"

# ============================================================
# Step 4: Dependency installation
# ============================================================

echo "[Wispbyte] Installing dependencies..."

# Approve known required lifecycle scripts (npm v11+ requires explicit approval).
# better-sqlite3 needs node-gyp rebuild for native addon.
# esbuild needs postinstall to download platform binary.
# Only approve known packages — never approve unknown scripts.
if npm install-scripts ls 2>/dev/null | grep -q "unreviewed"; then
  echo "[Wispbyte] Approving required lifecycle scripts..."
  npm install-scripts approve better-sqlite3 esbuild 2>/dev/null || true
fi

# Use npm ci for deterministic install from lockfile.
# Lifecycle scripts are NOT skipped — better-sqlite3 (node-gyp rebuild)
# and esbuild (platform binary download) require them.
if [ -f "package-lock.json" ]; then
  if ! npm ci --no-fund --no-audit 2>&1; then
    echo "[Wispbyte] npm ci failed. Attempting npm install..."
    if ! npm install --no-fund --no-audit 2>&1; then
      echo "[Wispbyte] FATAL: Dependency installation failed."
      exit 1
    fi
  fi
else
  echo "[Wispbyte] No package-lock.json found. Running npm install..."
  if ! npm install --no-fund --no-audit 2>&1; then
    echo "[Wispbyte] FATAL: Dependency installation failed."
    exit 1
  fi
fi

echo "[Wispbyte] Dependencies ready."

# ============================================================
# Step 5: Native dependency verification
# ============================================================

echo "[Wispbyte] Verifying native dependencies..."

# better-sqlite3: required by src/database/database.ts
if ! node -e "require('better-sqlite3')" 2>/dev/null; then
  echo "[Wispbyte] WARNING: better-sqlite3 failed to load. Database layer may not work."
  echo "[Wispbyte] Attempting rebuild of better-sqlite3..."
  if ! npm rebuild better-sqlite3 2>&1; then
    echo "[Wispbyte] FATAL: better-sqlite3 rebuild failed."
    exit 1
  fi
fi

# esbuild: required by tsx (build tooling)
if ! node -e "require('esbuild')" 2>/dev/null; then
  echo "[Wispbyte] WARNING: esbuild failed to load. Build tooling may not work."
  echo "[Wispbyte] Attempting rebuild of esbuild..."
  if ! npm rebuild esbuild 2>&1; then
    echo "[Wispbyte] FATAL: esbuild rebuild failed."
    exit 1
  fi
fi

# ============================================================
# Step 6: Playwright Chromium (optional)
# ============================================================

# Playwright/Chromium is optional. The application degrades gracefully:
# browser features disabled, HTTP pipeline remains active.
# We only install Chromium when it's missing to save resources.

CHROMIUM_READY=false

# Space requirements:
#   Archive download:           ~184 MiB
#   Extraction overhead:        ~150 MiB
#   Runtime browser cache:      ~100 MiB
#   Safety margin:               ~66 MiB
#   Total recommended minimum:   500 MiB
CHROMIUM_REQUIRED_MB="${ASHENAI_PLAYWRIGHT_MIN_FREE_MB:-500}"

# Persistent flag: once ENOSPC occurs, do NOT retry until
# Chromium is detected as installed (user frees space + restarts).
ENOSPC_FLAG="$APP_DIR/.enospc-flag"

check_disk_space_mb() {
  local path="${1:-.}"
  local free_kb
  free_kb=$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $4}')
  echo $(( ${free_kb:-0} / 1024 ))
}

cleanup_before_install() {
  local freed=0

  # 1. Playwright stale temp directories (download leftovers, version locks)
  if [ -d "$TMPDIR" ]; then
    for d in "$TMPDIR"/playwright-* "$TMPDIR"/pw-*; do
      if [ -d "$d" ]; then
        local sz
        sz=$(du -sm "$d" 2>/dev/null | awk '{print $1}')
        rm -rf "$d"
        freed=$(( freed + ${sz:-0} ))
      fi
    done
  fi
  if [ -d "/tmp" ]; then
    for d in /tmp/playwright-* /tmp/pw-*; do
      if [ -d "$d" ]; then
        local sz
        sz=$(du -sm "$d" 2>/dev/null | awk '{print $1}')
        rm -rf "$d"
        freed=$(( freed + ${sz:-0} ))
      fi
    done
  fi

  # 2. Stale Playwright download archives (partial .zip/.zip.tmp files)
  local pw_cache="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache}/ms-playwright"
  if [ -d "$pw_cache" ]; then
    find "$pw_cache" -maxdepth 2 \( -name "*.zip" -o -name "*.zip.tmp" -o -name "*.crdownload" \) -delete 2>/dev/null || true
    # Remove empty stale version directories (not a full install)
    find "$pw_cache" -maxdepth 1 -type d -empty -delete 2>/dev/null || true
  fi

  echo "$freed"
}

if node -e "require('playwright')" 2>/dev/null; then

  # ---- ENOSPC flag: prevent repeated download loops ----
  if [ -f "$ENOSPC_FLAG" ]; then
    # Flag exists from a prior ENOSPC failure.
    # If Chromium is now present (user freed space + manually installed),
    # clear the flag and continue normally.
    if node -e "
      const { chromium } = require('playwright');
      const path = chromium.executablePath();
      const fs = require('fs');
      if (path && fs.existsSync(path)) { process.exit(0); }
      process.exit(1);
    " 2>/dev/null; then
      rm -f "$ENOSPC_FLAG"
      echo "[Wispbyte] Playwright Chromium detected; clearing prior ENOSPC flag."
      CHROMIUM_READY=true
    else
      echo "[Wispbyte] Chromium unavailable (prior ENOSPC). Skipping browser install."
      echo "[Wispbyte] HTTP/web pipeline remains active. Browser features disabled."
    fi
  fi

  # ---- Chromium already installed? Reuse it. ----
  if [ "$CHROMIUM_READY" = false ]; then
    if node -e "
      const { chromium } = require('playwright');
      const path = chromium.executablePath();
      const fs = require('fs');
      if (path && fs.existsSync(path)) { process.exit(0); }
      process.exit(1);
    " 2>/dev/null; then
      echo "[Wispbyte] Playwright Chromium already installed."
      CHROMIUM_READY=true
    fi
  fi

  # ---- Chromium missing: prepare for installation ----
  if [ "$CHROMIUM_READY" = false ]; then
    FREE_MB=$(check_disk_space_mb "$APP_DIR")
    echo "[Wispbyte] Storage: available=${FREE_MB}MiB required=${CHROMIUM_REQUIRED_MB}MiB"

    if [ "$FREE_MB" -lt "$CHROMIUM_REQUIRED_MB" ]; then
      echo "[Wispbyte] Cleaning disposable caches before install attempt..."
      freed_mb=$(cleanup_before_install)
      FREE_MB=$(check_disk_space_mb "$APP_DIR")
      echo "[Wispbyte] Storage after cleanup: available=${FREE_MB}MiB required=${CHROMIUM_REQUIRED_MB}MiB (freed ${freed_mb}MiB)"
    fi

    if [ "$FREE_MB" -lt "$CHROMIUM_REQUIRED_MB" ]; then
      echo "[Wispbyte] Insufficient disk space for Chromium (${FREE_MB}MiB available, ${CHROMIUM_REQUIRED_MB}MiB required)."
      echo "[Wispbyte] Browser features will be disabled. HTTP pipeline remains active."
      touch "$ENOSPC_FLAG"
    else
      # ---- Single installation attempt ----
      echo "[Wispbyte] Playwright Chromium missing; installing..."
      INSTALL_OUTPUT=$(npx playwright install chromium 2>&1) && INSTALL_RC=0 || INSTALL_RC=$?
      echo "$INSTALL_OUTPUT"

      if [ "$INSTALL_RC" -eq 0 ]; then
        echo "[Wispbyte] Playwright Chromium installed."
        CHROMIUM_READY=true
        rm -f "$ENOSPC_FLAG"
      elif echo "$INSTALL_OUTPUT" | grep -qi "ENOSPC\|no space left on device"; then
        echo "[Wispbyte] ENOSPC during Chromium download. Cleaning partial files..."
        # Remove partial download artifacts only (not a full install)
        pw_cache="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache}/ms-playwright"
        if [ -d "$pw_cache" ]; then
          find "$pw_cache" -maxdepth 2 \( -name "*.zip" -o -name "*.zip.tmp" -o -name "*.crdownload" \) -delete 2>/dev/null || true
          find "$pw_cache" -maxdepth 1 -type d -empty -delete 2>/dev/null || true
        fi
        # Also clean Playwright temp dirs
        for d in "$TMPDIR"/playwright-* "$TMPDIR"/pw-* /tmp/playwright-* /tmp/pw-*; do
          [ -d "$d" ] && rm -rf "$d" 2>/dev/null || true
        done
        touch "$ENOSPC_FLAG"
        echo "[Wispbyte] Chromium download failed (ENOSPC). Browser features disabled. HTTP pipeline remains active."
      else
        echo "[Wispbyte] WARNING: Playwright Chromium installation failed."
        echo "[Wispbyte] Browser features will be disabled. HTTP pipeline remains active."
      fi
    fi
  fi

else
  echo "[Wispbyte] Playwright not installed. Browser features will be disabled."
fi

# ============================================================
# Step 7: Final runtime verification
# ============================================================

echo "[Wispbyte] Runtime verification..."

# Verify tsx (required to run src/index.ts)
if ! node -e "require('tsx')" 2>/dev/null && ! npx tsx --version >/dev/null 2>&1; then
  echo "[Wispbyte] FATAL: tsx not available."
  exit 1
fi

# Verify entry file exists
if [ ! -f "src/index.ts" ]; then
  echo "[Wispbyte] FATAL: src/index.ts not found."
  exit 1
fi

echo "[Wispbyte] Runtime verification passed."

# ============================================================
# Step 8: Start AshenAI
# ============================================================

echo "[Wispbyte] Starting AshenAI..."
exec node --import tsx src/index.ts
