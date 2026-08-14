#!/usr/bin/env bash

set -u

PORT="${PORT:-10000}"
BOT_PID=""

cleanup() {
  echo "🛑 Render wrapper stopping..."
  if [ -n "${BOT_PID}" ] && kill -0 "${BOT_PID}" 2>/dev/null; then
    kill "${BOT_PID}" 2>/dev/null || true
    wait "${BOT_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "🔥 Starting AshenAI..."
echo "🌐 Health server port: ${PORT}"

# Start the existing AshenAI bot.
npm run bot &
BOT_PID=$!

echo "🤖 AshenAI PID: ${BOT_PID}"

# Health server stays in the foreground so Render has a stable process.
node scripts/render-health.js "${PORT}" "${BOT_PID}" &
HEALTH_PID=$!

echo "💚 Health server PID: ${HEALTH_PID}"

wait "${BOT_PID}"
BOT_EXIT=$?

echo "❌ AshenAI stopped with exit code ${BOT_EXIT}"

kill "${HEALTH_PID}" 2>/dev/null || true

exit "${BOT_EXIT}"
