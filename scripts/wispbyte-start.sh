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
    echo "[Wispbyte] WARNING: npm ci failed (lockfile may be stale). Trying npm install..."
    echo "[Wispbyte] NOTE: If this succeeds, consider regenerating package-lock.json locally."
    if ! npm install --no-fund --no-audit 2>&1; then
      echo "[Wispbyte] FATAL: Both npm ci and npm install failed."
      echo "[Wispbyte] Check Node version ($(node --version)) and platform compatibility."
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

# Resource check: disk, RAM, CPU.
# Never crashes startup — always exits 0.
# Sourced (not executed) so the ASHENAI_RESOURCE_* values propagate
# to ensure-playwright.sh; `set -a` auto-exports them.
export APP_DIR
set -a
# shellcheck source=check-resources.sh
. "$APP_DIR/scripts/check-resources.sh" || true
set +a

# Chromium is optional — the application degrades gracefully when unavailable.
# We only install when ASHENAI_PLAYWRIGHT_BOOTSTRAP=1 and the binary is missing.
# Subsequent restarts never re-download if the binary already exists.
# Disk protection: installation is skipped if disk is critically low.

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
export PLAYWRIGHT_SKIP_BROWSER_GC="${PLAYWRIGHT_SKIP_BROWSER_GC:-1}"

bash "$APP_DIR/scripts/ensure-playwright.sh"

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
