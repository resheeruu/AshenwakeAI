#!/usr/bin/env bash

set -u

echo "🔥 Starting AshenAI..."
export PORT="${PORT:-10000}"
echo "🌐 Render PORT: $PORT"
if command -v ffmpeg >/dev/null 2>&1; then
  echo "🎵 FFmpeg check: AVAILABLE ($(ffmpeg -version | head -1))"
else
  echo "❌ FFmpeg check: NOT AVAILABLE"
fi

exec npx tsx src/index.ts
