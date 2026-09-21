#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"

echo "[start] AshenAI Generic Startup"
echo "[start] NODE_ENV=${NODE_ENV}"
echo "[start] PORT=${PORT}"
echo "[start] ROOT=${ROOT_DIR}"

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

if [[ -x "${ROOT_DIR}/scripts/resource-monitor.sh" ]]; then
    bash "${ROOT_DIR}/scripts/resource-monitor.sh" || \
        echo "[start] Resource monitor returned non-zero; continuing."
fi

echo "[PLAYWRIGHT] Automatic Chromium installation disabled."
echo "[PLAYWRIGHT] Browser features will be disabled if Chromium is unavailable."

echo "[start] Starting AshenAI on port ${PORT}..."

exec node ./node_modules/.bin/tsx src/index.ts
