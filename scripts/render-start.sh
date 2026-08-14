#!/usr/bin/env bash

set -u

echo "🔥 Starting AshenAI..."
echo "🌐 Render PORT: ${PORT:-10000}"

npm run bot &
BOT_PID=$!

echo "🤖 AshenAI PID: ${BOT_PID}"

cleanup() {
  echo "🛑 Render wrapper stopping..."

  if kill -0 "${BOT_PID}" 2>/dev/null; then
    kill "${BOT_PID}" 2>/dev/null || true
    wait "${BOT_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

wait "${BOT_PID}"
BOT_EXIT=$?

echo "❌ AshenAI stopped with exit code ${BOT_EXIT}"

exit "${BOT_EXIT}"
