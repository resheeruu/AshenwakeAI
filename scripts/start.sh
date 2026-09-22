#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NODE_ENV="${NODE_ENV:-production}"

echo "[start] AshenAI Generic Startup"
echo "[start] NODE_ENV=${NODE_ENV}"
echo "[start] ROOT=${ROOT_DIR}"

# First-run detection: if .env is missing, run setup
if [[ ! -f "${ROOT_DIR}/.env" ]]; then
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║         AshenAI First Run Detected       ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""
    echo "  No .env file found. Running setup..."
    echo ""

    # Run setup with set +e so we can capture the exit code
    # (set -e would exit the script before we can check)
    set +e
    if [[ -f "${ROOT_DIR}/node_modules/.bin/tsx" ]]; then
        node ./node_modules/.bin/tsx scripts/setup.ts
    elif command -v npx >/dev/null 2>&1; then
        npx tsx scripts/setup.ts
    else
        echo "  ERROR: Cannot run setup — tsx not available."
        echo "  Run: npm run setup"
        exit 1
    fi
    SETUP_EXIT=$?
    set -e
    if [ $SETUP_EXIT -ne 0 ]; then
        exit 1
    fi
fi

if [ -z "${PORT:-}" ]; then
    echo "[start] ERROR: PORT environment variable is required but not set."
    exit 1
fi
echo "[start] PORT=${PORT}"

command -v node >/dev/null 2>&1 || {
    echo "[start] ERROR: Node.js is not installed."
    exit 1
}

command -v npm >/dev/null 2>&1 || {
    echo "[start] ERROR: npm is not installed."
    exit 1
}

echo "[start] Node: $(node --version)"
echo "[start] npm:  $(npm --version)"

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "[start] ERROR: node_modules missing."
    echo "[start] Run npm ci before starting AshenAI."
    exit 1
fi

# Resource check: disk, RAM, CPU. Never crashes startup.
export APP_DIR="${ROOT_DIR}"
if [[ -f "${ROOT_DIR}/scripts/check-resources.sh" ]]; then
    . "$APP_DIR/scripts/check-resources.sh" || true
fi

echo "[start] Starting AshenAI on port ${PORT}..."

exec node ./node_modules/.bin/tsx src/index.ts
