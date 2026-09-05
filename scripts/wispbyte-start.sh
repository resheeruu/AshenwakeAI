#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# AshenAI Wispbyte Deployment Startup
#
# Replaces the raw "git pull origin main && npm run bot" command.
# Handles package-lock.json conflicts, quiet git output,
# and prevents stale-code startup on sync failure.
# ============================================================

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${ASHENAI_BRANCH:-main}"
cd "$APP_DIR" || exit 1

# ---------- Step 1: Detect dirty working tree BEFORE pulling ----------

DIRTY_FILES="$(git status --porcelain 2>/dev/null || true)"

if [ -n "$DIRTY_FILES" ]; then
    # Check if ONLY package-lock.json is dirty (hosting platform artifact).
    # Lines containing "package-lock.json" are allowed; anything else is a real conflict.
    NON_LOCK_DIRTY="$(echo "$DIRTY_FILES" | grep -v 'package-lock.json' || true)"

    if [ -n "$NON_LOCK_DIRTY" ]; then
        echo "[Wispbyte] Repository synchronization failed."
        echo "[Wispbyte] Conflicting local changes detected:"
        echo "$NON_LOCK_DIRTY" | head -5
        echo "[Wispbyte] AshenAI was not started from the requested revision."
        exit 1
    fi

    # Only package-lock.json is dirty — restore it before pulling
    echo "[Wispbyte] Restoring package-lock.json (hosting platform artifact)..."
    git checkout -- package-lock.json 2>/dev/null || true
fi

# ---------- Step 2: Quiet git pull ----------

echo "[Wispbyte] Synchronizing repository..."

if ! git pull --quiet --ff-only origin "$BRANCH"; then
    echo "[Wispbyte] Repository synchronization failed."
    echo "[Wispbyte] AshenAI was not started from the requested revision."
    exit 1
fi

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "[Wispbyte] Repository synchronized. Revision: $COMMIT"

# ---------- Step 3: Ensure dependencies are current ----------

if [ -f "package-lock.json" ]; then
    npm ci --ignore-scripts --no-fund --no-audit 2>/dev/null || npm install --ignore-scripts --no-fund --no-audit 2>/dev/null || true
fi

# ---------- Step 4: Start AshenAI ----------

echo "[Wispbyte] Starting AshenAI..."
exec node --import tsx src/index.ts
