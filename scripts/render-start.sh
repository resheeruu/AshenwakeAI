#!/usr/bin/env bash

set -u

echo "🔥 Starting AshenAI..."
export PORT="${PORT:-10000}"
echo "🌐 Render PORT: $PORT"

exec npx tsx src/index.ts
