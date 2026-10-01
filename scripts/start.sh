#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NODE_ENV="${NODE_ENV:-production}"

echo "[start] AshenAI Production Startup"
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

    set +e
    npx tsx scripts/setup.ts
    SETUP_EXIT=$?
    set -e
    if [ $SETUP_EXIT -ne 0 ]; then
        exit 1
    fi
fi

# PORT resolution
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

# --- Detect deployment mode ---
# In Docker production image: src/ does not exist (only dist/ is copied from builder)
# In normal deployment: src/ exists and we need to build
if [[ -d "${ROOT_DIR}/src" ]]; then
    DEPLOY_MODE="writable"
    echo "[start] Source directory present — writable deployment mode"
else
    DEPLOY_MODE="readonly"
    echo "[start] Source directory absent — read-only production container mode"
fi

# --- Dependency installation detection ---
NEED_INSTALL=0

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "[start] node_modules not found — will install dependencies"
    NEED_INSTALL=1
else
    # Check if package-lock.json is newer than node_modules
    if [[ "${ROOT_DIR}/package-lock.json" -nt "${ROOT_DIR}/node_modules" ]]; then
        echo "[start] package-lock.json changed since last install — will reinstall"
        NEED_INSTALL=1
    fi
    # Check if package.json is newer than node_modules (new deps added)
    if [[ "${ROOT_DIR}/package.json" -nt "${ROOT_DIR}/node_modules" ]]; then
        echo "[start] package.json changed since last install — will reinstall"
        NEED_INSTALL=1
    fi
fi

if [[ $NEED_INSTALL -eq 1 ]]; then
    if [[ "${DEPLOY_MODE}" == "readonly" ]]; then
        echo "[start] ERROR: Dependencies need installation but running in read-only container"
        echo "[start] Rebuild the Docker image to include updated dependencies"
        exit 1
    fi
    echo "[start] Installing production dependencies (npm ci --omit=dev)..."
    if ! npm ci --omit=dev; then
        echo "[start] ERROR: npm ci failed"
        exit 1
    fi
    echo "[start] Dependencies installed successfully"
else
    echo "[start] Dependencies up to date — skipping install"
fi

# --- Production build (only in writable mode) ---
if [[ "${DEPLOY_MODE}" == "writable" ]]; then
    echo "[start] Building production artifacts (npm run build)..."
    if ! npm run build; then
        echo "[start] ERROR: Build failed — will not start stale artifacts"
        exit 1
    fi
    echo "[start] Build completed successfully"
else
    echo "[start] Skipping build — using pre-built artifacts from Docker image"
fi

# --- Build artifact verification ---
REQUIRED_ARTIFACTS=(
    "dist/index.js"
    "dist/cli.js"
    "dist/web/server.js"
    "dist/web/public/index.html"
    "dist/web/public/dashboard.html"
    "dist/web/public/css/base.css"
    "dist/web/public/js/app.js"
    "dist/assets/emojis/icon-metadata.json"
)

echo "[start] Verifying build artifacts..."
for artifact in "${REQUIRED_ARTIFACTS[@]}"; do
    if [[ ! -f "${ROOT_DIR}/${artifact}" ]]; then
        echo "[start] ERROR: Required build artifact missing: ${artifact}"
        exit 1
    fi
done
echo "[start] All required build artifacts present"

# --- Runtime asset verification ---
REQUIRED_ASSETS=(
    "dist/assets/emojis"
    "dist/web/public/assets"
)

echo "[start] Verifying runtime assets..."
for asset in "${REQUIRED_ASSETS[@]}"; do
    if [[ ! -d "${ROOT_DIR}/${asset}" ]]; then
        echo "[start] ERROR: Required asset directory missing: ${asset}"
        exit 1
    fi
done
echo "[start] All required asset directories present"

# --- Anime GIF library verification ---
echo "[start] Verifying local GIF library..."
GIF_ROOT="${ROOT_DIR}/data/anime-gifs"
GIF_SEED="${ROOT_DIR}/anime-gifs-seed"

if [[ ! -d "${GIF_ROOT}" ]]; then
    echo "[start] GIF library directory missing, creating..."
    mkdir -p "${GIF_ROOT}"
fi

# Seed from baked-in seed if directory is empty
if [[ -d "${GIF_SEED}" ]] && [[ -z "$(ls -A "${GIF_ROOT}" 2>/dev/null)" ]]; then
    echo "[start] Seeding GIF library from baked-in seed..."
    cp -r "${GIF_SEED}/." "${GIF_ROOT}/"
    echo "[start] GIF library seeded successfully"
fi

# Verify GIF library has assets
GIF_COUNT=$(find "${GIF_ROOT}" -name "*.gif" -type f 2>/dev/null | wc -l)
if [[ ${GIF_COUNT} -eq 0 ]]; then
    echo "[start] WARNING: Local GIF library is empty (${GIF_COUNT} GIFs found)"
    echo "[start] Ash Actions will fall back to remote providers"
else
    echo "[start] Local GIF library verified: ${GIF_COUNT} GIFs found"
fi

# Verify GIF library structure
ACTIONS_DIR="${GIF_ROOT}/actions"
if [[ ! -d "${ACTIONS_DIR}" ]]; then
    echo "[start] WARNING: GIF actions directory missing"
else
    ACTION_DIRS=$(find "${ACTIONS_DIR}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    echo "[start] GIF action categories: ${ACTION_DIRS}"
fi
echo "[start] All runtime assets present"

# --- Resource check ---
export APP_DIR="${ROOT_DIR}"
if [[ -f "${ROOT_DIR}/scripts/check-resources.sh" ]]; then
    . "$APP_DIR/scripts/check-resources.sh"
fi

# --- Preflight validation (environment, database, config) ---
echo "[start] Running preflight validation..."
if ! npx tsx -e "
const { validateRuntime, validateSecurityConfig } = require('./dist/config/env');
try {
    validateSecurityConfig();
    validateRuntime();
    console.log('[preflight] Environment validation passed');
} catch (e) {
    console.error('[preflight] ERROR:', e.message);
    process.exit(1);
}
"; then
    echo "[start] ERROR: Preflight validation failed"
    exit 1
fi
echo "[start] Preflight validation passed"

# --- Start application ---
if [ -n "${PORT:-}" ]; then
    echo "[start] Starting AshenAI on port ${PORT}..."
else
    echo "[start] Starting AshenAI (port from .env, else 8080)..."
fi

exec node "${ROOT_DIR}/dist/index.js"