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

# PORT resolution — the application (src/web/server.ts) reads
# process.env.PORT, then .env via dotenv (dotenv never overwrites an
# already-exported variable), then falls back to 8080.
#
#   1. Host/panel-provided PORT always wins (Wispbyte Startup env,
#      Docker -e PORT=..., Render, plain `PORT=9002 npm start`).
#   2. PORT from .env — only reachable when the shell does NOT export a
#      default first, otherwise dotenv is shadowed and .env PORT is lost.
#   3. Documented local fallback 8080, exported only when there is no
#      .env that could supply a port.
#
# Wispbyte does NOT auto-inject PORT: the allocated port must be set in
# Startup -> Environment Variables (e.g. PORT=9002). When it is absent
# the app keeps its 8080 fallback and will not match the panel port.
if [ -z "${PORT:-}" ] && [ ! -f "${ROOT_DIR}/.env" ]; then
    export PORT=8080
    echo "[start] PORT not set — using default ${PORT}"
fi
if [ -n "${PORT:-}" ]; then
    if ! [[ "${PORT}" =~ ^[0-9]+$ ]] || [ "${PORT}" -lt 1 ] || [ "${PORT}" -gt 65535 ]; then
        echo "[start] ERROR: PORT must be an integer between 1 and 65535 (got '${PORT}')."
        exit 1
    fi
    echo "[start] PORT=${PORT}"
else
    echo "[start] PORT not set in environment — using .env PORT if present, otherwise fallback 8080"
fi

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

# Fresh Git clone has no node_modules. Install once, then reuse the cache
# on subsequent restarts (do not re-run npm install every boot).
if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "[start] node_modules missing — running npm ci (fresh clone)"
    if [[ -f "${ROOT_DIR}/package-lock.json" ]]; then
        npm ci --no-fund --no-audit
    else
        npm install --no-fund --no-audit
    fi
fi

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "[start] ERROR: node_modules missing after install."
    echo "[start] Run npm ci before starting AshenAI."
    exit 1
fi

# Resource check: disk, RAM, CPU. Never crashes startup.
export APP_DIR="${ROOT_DIR}"
if [[ -f "${ROOT_DIR}/scripts/check-resources.sh" ]]; then
    . "$APP_DIR/scripts/check-resources.sh" || true
fi

if [ -n "${PORT:-}" ]; then
    echo "[start] Starting AshenAI on port ${PORT}..."
else
    echo "[start] Starting AshenAI (port from .env, else 8080)..."
fi

# Production startup requires a pre-built dist/ artifact.
# Build it during the build phase with: npm ci && npm run build
# Then start with: bash scripts/start.sh (or npm start — no prestart hook runs).
if [[ ! -f "${ROOT_DIR}/dist/index.js" ]]; then
    echo "[start] ERROR: dist/index.js not found."
    echo "[start] Build the project before starting with: npm run build"
    echo "[start] Or ensure a pre-built dist/ artifact is deployed."
    exit 1
fi

exec node "${ROOT_DIR}/dist/index.js"
