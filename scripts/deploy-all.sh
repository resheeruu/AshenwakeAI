#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
RENDER_URL="https://ashenwakeai.onrender.com/api/health"
MAX_CHECKS=12
CHECK_INTERVAL=5

cd "$PROJECT_DIR" || exit 1

echo "================================="
echo "🔥 ASHENAI FAST DEPLOY"
echo "================================="

echo "🧪 Building..."

if ! npm run build; then
    echo "❌ BUILD FAILED"
    exit 1
fi

echo "✅ Build successful."

if [ -n "$(git status --porcelain)" ]; then
    echo "📦 Changes detected."

    git add -A

    if ! git commit -m "Update AshenAI $(date '+%Y-%m-%d %H:%M:%S')"; then
        echo "❌ Commit failed."
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

echo "📱 Syncing Termux..."

if ! git pull --ff-only origin main; then
    echo "❌ Termux sync failed."
    exit 1
fi

TERMUX_VERSION="$(git rev-parse --short HEAD)"

if [ "$TERMUX_VERSION" != "$VERSION" ]; then
    echo "❌ Termux mismatch."
    echo "Expected: $VERSION"
    echo "Actual: $TERMUX_VERSION"
    exit 1
fi

echo "✅ Termux: $TERMUX_VERSION"

echo "🧪 Verifying build..."

if ! npm run build >/dev/null 2>&1; then
    echo "❌ Termux build failed."
    exit 1
fi

echo "✅ Termux build verified."

echo "☁️ Waiting for Render..."

RENDER_VERSION=""

for ((i=1; i<=MAX_CHECKS; i++)); do

    RESPONSE="$(
        curl -fsS \
        --max-time 10 \
        "$RENDER_URL" \
        2>/dev/null || true
    )"

    if [ -n "$RESPONSE" ]; then

        RENDER_VERSION="$(
            printf '%s' "$RESPONSE" |
            sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
        )"

        if [ "$RENDER_VERSION" = "$VERSION" ]; then
            break
        fi

        echo "⏳ Render: ${RENDER_VERSION:-unknown} [$i/$MAX_CHECKS]"

    else
        echo "⚠️ Render check failed [$i/$MAX_CHECKS]"
    fi

    sleep "$CHECK_INTERVAL"
done

echo "================================="

if [ "$RENDER_VERSION" = "$VERSION" ]; then

    echo "🎉 FAST DEPLOY COMPLETE"
    echo "================================="
    echo "🐙 GitHub:  $VERSION ✅"
    echo "☁️ Render:  $RENDER_VERSION ✅"
    echo "📱 Termux:  $TERMUX_VERSION ✅"
    echo "🛡️ Failover: AUTO"
    echo "================================="

else

    echo "⚠️ RENDER NOT VERIFIED"
    echo "================================="
    echo "🐙 GitHub: $VERSION ✅"
    echo "📱 Termux: $TERMUX_VERSION ✅"
    echo "☁️ Render: ${RENDER_VERSION:-UNKNOWN} ⚠️"
    echo "================================="

    exit 1
fi
