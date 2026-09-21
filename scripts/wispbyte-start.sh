#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# AshenAI Wispbyte Deployment Startup
#
# Wispbyte deploys the repository — startup does NOT contact
# GitHub. Every stage is bounded and observable.
#
# Sequence:
#   1/8: Runtime      — verify node, npm
#   2/8: Repository   — validate checkout (no network)
#   3/8: Dependencies — install only when needed
#   4/8: Resources    — disk, RAM, CPU
#   5/8: Environment  — validate .env
#   6/8: Native       — verify better-sqlite3, esbuild
#   7/8: Application  — verify entry file, tsx
#   8/8: Launch       — exec node
#
# If any required step fails: STOP, non-zero exit, no bot start.
# ============================================================

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR" || { echo "[Wispbyte] FATAL: Cannot cd to $APP_DIR"; exit 1; }

STAGE_START=$(date +%s%N 2>/dev/null || date +%s)

stage_begin() {
  local num="$1" name="$2"
  echo "[Wispbyte] Stage ${num}/8: ${name}..."
}

stage_ok() {
  local num="$1" name="$2" start_ns="$3"
  local elapsed="?"
  if [ -n "$start_ns" ] && [ "$start_ns" -gt 0 ] 2>/dev/null; then
    local now_ns
    now_ns=$(date +%s%N 2>/dev/null || echo "0")
    if [ "$now_ns" -gt 0 ] 2>/dev/null && [ "$now_ns" -gt "$start_ns" ] 2>/dev/null; then
      elapsed=$(awk "BEGIN{printf \"%.1f\", ($now_ns - $start_ns) / 1000000000}")
    fi
  fi
  echo "[Wispbyte] Stage ${num}/8: ${name} OK${elapsed:+ in ${elapsed}s}"
}

stage_fail() {
  local num="$1" name="$2" reason="$3"
  echo "[Wispbyte] Stage ${num}/8: ${name} FAILED: ${reason}"
}

# ============================================================
# Stage 1/8: Runtime
# ============================================================

S1=$(date +%s%N 2>/dev/null || date +%s)
stage_begin 1 "Runtime"

if ! command -v node >/dev/null 2>&1; then
  stage_fail 1 "Runtime" "node not found"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  stage_fail 1 "Runtime" "npm not found"
  exit 1
fi

NODE_VER=$(node --version)
NPM_VER=$(npm --version 2>/dev/null || echo "unknown")
echo "[Wispbyte] node=${NODE_VER} npm=${NPM_VER}"

# Validate Node >= 20 (matches package.json engines)
NODE_MAJOR="${NODE_VER#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [ "$NODE_MAJOR" -lt 20 ] 2>/dev/null; then
  stage_fail 1 "Runtime" "Node ${NODE_VER} < 20 (required by package.json engines)"
  exit 1
fi

stage_ok 1 "Runtime" "$S1"

# ============================================================
# Stage 2/8: Repository
# ============================================================

S2=$(date +%s%N 2>/dev/null || date +%s)
stage_begin 2 "Repository"

# Wispbyte deploys the correct repository/branch. We only validate
# the checkout exists — no network operations (no git pull/fetch).
if [ ! -d ".git" ]; then
  stage_fail 2 "Repository" ".git directory not found"
  exit 1
fi

if [ ! -f "src/index.ts" ]; then
  stage_fail 2 "Repository" "src/index.ts not found — incomplete checkout"
  exit 1
fi

REPO_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
REPO_BRANCH="$(git branch --show-current 2>/dev/null || echo 'unknown')"
if [ "$REPO_SHA" = "unknown" ] || [ "$REPO_BRANCH" = "unknown" ]; then
  echo "[Wispbyte] Commit: ${REPO_SHA} branch: ${REPO_BRANCH} (git metadata unavailable in this environment)"
else
  echo "[Wispbyte] Commit: ${REPO_SHA} branch: ${REPO_BRANCH}"
fi

stage_ok 2 "Repository" "$S2"

# ============================================================
# Stage 3/8: Dependencies
# ============================================================

S3=$(date +%s%N 2>/dev/null || date +%s)
stage_begin 3 "Dependencies"

SKIP_INSTALL=0

# Dependency validation strategy:
# Store a sha256 content hash of package-lock.json inside node_modules/
# after each successful npm ci. On restart, recompute the hash and compare.
# This directly proves the lockfile has not changed since the last install,
# without relying on filesystem timestamps (which are unreliable in
# containers) or lockfileVersion alone (which does not prove content match).
DEP_HASH_FILE="node_modules/.ashenai-dep-hash"
LOCKFILE_HASH=$(sha256sum package-lock.json 2>/dev/null | awk '{print $1}' || echo "")

if [ -d "node_modules" ] && [ -f "package-lock.json" ] && [ -n "$LOCKFILE_HASH" ]; then
  if [ -f "$DEP_HASH_FILE" ]; then
    STORED_HASH=$(cat "$DEP_HASH_FILE" 2>/dev/null || echo "")
    if [ "$LOCKFILE_HASH" = "$STORED_HASH" ]; then
      SKIP_INSTALL=1
      echo "[Wispbyte] Dependency hash matches lockfile (skipping install)"
    else
      echo "[Wispbyte] Dependency hash mismatch (lockfile changed or node_modules stale)"
    fi
  else
    echo "[Wispbyte] No dependency hash found (first run after manual install)"
  fi
else
  if [ ! -d "node_modules" ]; then
    echo "[Wispbyte] node_modules not found (fresh install)"
  fi
  if [ ! -f "package-lock.json" ]; then
    echo "[Wispbyte] package-lock.json not found"
  fi
  if [ -z "$LOCKFILE_HASH" ]; then
    echo "[Wispbyte] Could not compute lockfile hash"
  fi
fi

if [ "$SKIP_INSTALL" -eq 0 ]; then
  # Approve known required lifecycle scripts (npm v11+ requires explicit approval).
  if npm install-scripts ls 2>/dev/null | grep -q "unreviewed" 2>/dev/null; then
    echo "[Wispbyte] Approving required lifecycle scripts..."
    npm install-scripts approve better-sqlite3 esbuild 2>/dev/null || true
  fi

  if [ -f "package-lock.json" ]; then
    echo "[Wispbyte] Running npm ci..."
    if ! npm ci --no-fund --no-audit 2>&1; then
      stage_fail 3 "Dependencies" "npm ci failed"
      exit 1
    fi
    # Store the lockfile hash after successful install for future restarts.
    mkdir -p node_modules
    sha256sum package-lock.json | awk '{print $1}' > "$DEP_HASH_FILE"
    echo "[Wispbyte] Dependency hash stored for future restarts"
  else
    echo "[Wispbyte] No package-lock.json. Running npm install..."
    if ! npm install --no-fund --no-audit 2>&1; then
      stage_fail 3 "Dependencies" "npm install failed"
      exit 1
    fi
    mkdir -p node_modules
    sha256sum package-lock.json | awk '{print $1}' > "$DEP_HASH_FILE"
  fi
fi

stage_ok 3 "Dependencies" "$S3"

# ============================================================
# Stage 4/8: Resources
# ============================================================

S4=$(date +%s%N 2>/dev/null || date +%s)
stage_begin 4 "Resources"

# Resource check: disk, RAM, CPU.
# Never crashes startup — always exits 0.
export APP_DIR
set -a
# shellcheck source=check-resources.sh
. "$APP_DIR/scripts/check-resources.sh" || true
set +a

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
export PLAYWRIGHT_SKIP_BROWSER_GC="${PLAYWRIGHT_SKIP_BROWSER_GC:-1}"

bash "$APP_DIR/scripts/ensure-playwright.sh"

stage_ok 4 "Resources" "$S4"

# ============================================================
# Stage 5/8: Environment
# ============================================================

S5=$(date +%s%N 2>/dev/null || date +%s)
stage_begin 5 "Environment"

# Load .env file if present (does not override existing env vars).
# This ensures variables are available for both this bash check
# and the Node process started in Stage 8.
if [ -f ".env" ]; then
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    key="$(echo "$key" | xargs)"
    # Only export if not already set in the environment
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < .env
fi

# Safe diagnostics: show variable presence, never values.
[ -n "${DISCORD_TOKEN:-}" ] && echo "[Wispbyte] DISCORD_TOKEN: SET" || echo "[Wispbyte] DISCORD_TOKEN: NOT SET"
[ -n "${DISCORD_CLIENT_ID:-}" ] && echo "[Wispbyte] DISCORD_CLIENT_ID: SET" || echo "[Wispbyte] DISCORD_CLIENT_ID: NOT SET"
[ -n "${ASHENAI_OWNER_USERNAME:-}" ] && echo "[Wispbyte] ASHENAI_OWNER_USERNAME: SET" || echo "[Wispbyte] ASHENAI_OWNER_USERNAME: NOT SET"

# Validate required environment variables exist (no secrets logged).
if [ -z "${DISCORD_TOKEN:-}" ]; then
  stage_fail 5 "Environment" "DISCORD_TOKEN not set (add it to .env or Wispbyte environment)"
  exit 1
fi

if [ -z "${DISCORD_CLIENT_ID:-}" ]; then
  stage_fail 5 "Environment" "DISCORD_CLIENT_ID not set (add it to .env or Wispbyte environment)"
  exit 1
fi

# Validate accounts.json or legacy owner env vars
if [ ! -f "data/accounts.json" ]; then
  if [ -z "${ASHENAI_OWNER_USERNAME:-}" ] || [ -z "${ASHENAI_OWNER_PASSWORD_HASH:-}" ]; then
    stage_fail 5 "Environment" "No owner account (need data/accounts.json or ASHENAI_OWNER_* env vars)"
    exit 1
  fi
fi

echo "[Wispbyte] Environment validated"
stage_ok 5 "Environment" "$S5"

# ============================================================
# Stage 6/8: Native modules
# ============================================================

S6=$(date +%s%N 2>/dev/null || date +%s)
stage_begin 6 "Native modules"

# better-sqlite3: required by src/database/database.ts
if ! node -e "require('better-sqlite3')" 2>/dev/null; then
  echo "[Wispbyte] WARNING: better-sqlite3 failed to load. Rebuilding..."
  if ! npm rebuild better-sqlite3 2>&1; then
    stage_fail 6 "Native modules" "better-sqlite3 rebuild failed"
    exit 1
  fi
fi

# esbuild: required by tsx (build tooling)
if ! node -e "require('esbuild')" 2>/dev/null; then
  echo "[Wispbyte] WARNING: esbuild failed to load. Rebuilding..."
  if ! npm rebuild esbuild 2>&1; then
    stage_fail 6 "Native modules" "esbuild rebuild failed"
    exit 1
  fi
fi

stage_ok 6 "Native modules" "$S6"

# ============================================================
# Stage 7/8: Application
# ============================================================

S7=$(date +%s%N 2>/dev/null || date +%s)
stage_begin 7 "Application"

# Verify tsx (required to run src/index.ts)
if ! node -e "require('tsx')" 2>/dev/null && ! npx tsx --version >/dev/null 2>&1; then
  stage_fail 7 "Application" "tsx not available"
  exit 1
fi

# Verify entry file exists
if [ ! -f "src/index.ts" ]; then
  stage_fail 7 "Application" "src/index.ts not found"
  exit 1
fi

stage_ok 7 "Application" "$S7"

# ============================================================
# Stage 8/8: Launch
# ============================================================

S8=$(date +%s%N 2>/dev/null || date +%s)
stage_begin 8 "Launch"

TOTAL_ELAPSED="?"
if [ "$STAGE_START" -gt 0 ] 2>/dev/null; then
  NOW=$(date +%s%N 2>/dev/null || date +%s)
  if [ "$NOW" -gt "$STAGE_START" ] 2>/dev/null; then
    TOTAL_ELAPSED=$(awk "BEGIN{printf \"%.1f\", ($NOW - $STAGE_START) / 1000000000}")
  fi
fi
echo "[Wispbyte] Startup preparation completed in ${TOTAL_ELAPSED}s"
echo "[Wispbyte] Launching AshenAI..."
exec node --import tsx src/index.ts
