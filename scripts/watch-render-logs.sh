#!/data/data/com.termux/files/usr/bin/bash

set -e

if [ -z "$ASHENAI_RENDER_URL" ]; then
  echo "❌ ASHENAI_RENDER_URL is not set."
  echo "Run:"
  echo 'export ASHENAI_RENDER_URL="https://your-app.onrender.com"'
  exit 1
fi

if [ -z "$LOG_STREAM_TOKEN" ]; then
  echo "❌ LOG_STREAM_TOKEN is not set."
  echo "Set the same token you configured in Render."
  exit 1
fi

URL="${ASHENAI_RENDER_URL%/}/api/logs/stream"

echo "🔥 AshenAI Render Log Monitor"
echo "🌐 $URL"
echo "📡 Connecting..."
echo

curl -N \
  --fail \
  -H "Authorization: Bearer $LOG_STREAM_TOKEN" \
  "$URL"
