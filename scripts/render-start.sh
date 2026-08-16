#!/usr/bin/env bash

set -u

echo "🔥 Starting AshenAI..."
echo "🌐 Render PORT: ${PORT:-10000}"

exec npx tsx src/index.ts
