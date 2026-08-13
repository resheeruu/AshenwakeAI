#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
RENDER_URL="https://ashenwakeai.onrender.com/api/health"
MAX_CHECKS=12
CHECK_INTERVAL=10

cd "$PROJECT_DIR" || exit 1

echo "================================="
echo "🔥 ASHENAI ONE-CLICK DEPLOY"
echo "================================="

echo "🧪 Building..."
if ! npm run build; then
    echo "❌ BUILD FAILED"
    echo "🚫 Deployment cancelled."
    exit 1
fi

echo "✅ Build successful."

if [ -n "$(git status --porcelain)" ]; then
    echo "📦 Changes detected."
    git add -A

    if ! git commit -m "Update AshenAI $(date '+%Y-%m-%d %H:%M:%S')"; then
        echo "❌ Git commit failed."
        exit 1
    fi
else
    echo "ℹ️ No changes detected."
fi

VERSION="$(git rev-parse --short HEAD)"

echo "🐙 Version: $VERSION"

echo "🐙 Pushing GitHub..."
if ! git push origin main; then
    echo "❌ GitHub push failed."
    exit 1
fi

echo "✅ GitHub updated."

echo "📱 Verifying Termux copy..."
git fetch origin main

REMOTE_VERSION="$(git rev-parse --short origin/main)"

if [ "$VERSION" != "$REMOTE_VERSION" ]; then
    echo "❌ Version mismatch."
    exit 1
fi

echo "✅ Termux/GitHub: $VERSION"

echo "🧪 Verifying build..."
if ! npm run build >/dev/null 2>&1; then
    echo "❌ Termux build verification failed."
    exit 1
fi

echo "✅ Termux build verified."

echo "☁️ Waiting for Render..."

RENDER_VERSION=""

for ((i=1; i<=MAX_CHECKS; i++)); do
    echo "🔎 Render check $i/$MAX_CHECKS..."

    RESPONSE="$(curl -fsS --max-time 15 "$RENDER_URL" 2>/dev/null || true)"

    if [ -n "$RESPONSE" ]; then
        RENDER_VERSION="$(printf '%s' "$RESPONSE" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"

        if [ "$RENDER_VERSION" = "$VERSION" ]; then
            break
        fi

        echo "⏳ Render: ${RENDER_VERSION:-unknown}"
    else
        echo "⚠️ Render health check failed."
    fi

    sleep "$CHECK_INTERVAL"
done

echo "================================="

if [ "$RENDER_VERSION" = "$VERSION" ]; then
    echo "🎉 ASHENAI DEPLOYMENT COMPLETE"
    echo "================================="
    echo "🐙 GitHub:  $VERSION ✅"
    echo "☁️ Render:  $RENDER_VERSION ✅"
    echo "📱 Termux:  $VERSION ✅"
    echo "🛡️ Failover: AUTO"
    echo "================================="
else
    echo "⚠️ RENDER DEPLOYMENT NOT VERIFIED"
    echo "================================="
    echo "🐙 GitHub: $VERSION ✅"
    echo "📱 Termux: $VERSION ✅"
    echo "☁️ Render: ${RENDER_VERSION:-UNKNOWN} ⚠️"
    echo "🚫 No second Discord bot started."
    exit 1
fi
