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

echo "🧪 Building AshenAI..."

if ! npm run build; then
    echo "❌ BUILD FAILED"
    echo "🚫 Nothing was deployed."
    exit 1
fi

echo "✅ Build successful."

echo "📦 Checking Git..."

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

echo "🐙 Local version: $VERSION"

echo "🐙 Pushing to GitHub..."

if ! git push origin main; then
    echo "❌ GitHub push failed."
    exit 1
fi

echo "✅ GitHub updated."

echo "📱 Synchronizing Termux..."

if ! git fetch origin main; then
    echo "❌ Git fetch failed."
    exit 1
fi

REMOTE_VERSION="$(git rev-parse --short origin/main)"

if [ "$VERSION" != "$REMOTE_VERSION" ]; then
    echo "❌ GitHub version mismatch."
    exit 1
fi

echo "✅ GitHub version: $VERSION"

TERMUX_RUNNING="false"

if [ -f "$PROJECT_DIR/.termux-backup.pid" ]; then

    TERMUX_PID="$(cat "$PROJECT_DIR/.termux-backup.pid" 2>/dev/null || true)"

    if [ -n "$TERMUX_PID" ] &&
       kill -0 "$TERMUX_PID" 2>/dev/null; then
        TERMUX_RUNNING="true"
    fi

fi

if [ "$TERMUX_RUNNING" = "true" ]; then

    echo "📱 Termux backup is ONLINE."
    echo "🔄 Stopping Termux for update..."

    "$PROJECT_DIR/scripts/ashennai-control.sh" termux-off

    sleep 2

else

    echo "📱 Termux backup is OFFLINE."
fi

echo "📥 Pulling GitHub version into Termux..."

if ! git pull --ff-only origin main; then
    echo "❌ Termux Git update failed."
    exit 1
fi

echo "🧪 Building synchronized Termux version..."

if ! npm run build; then
    echo "❌ Termux build failed."
    exit 1
fi

TERMUX_VERSION="$(git rev-parse --short HEAD)"

if [ "$TERMUX_VERSION" != "$VERSION" ]; then

    echo "❌ Termux version mismatch."
    echo "Expected: $VERSION"
    echo "Actual:   $TERMUX_VERSION"

    exit 1
fi

echo "✅ Termux synchronized: $TERMUX_VERSION"

if [ "$TERMUX_RUNNING" = "true" ]; then

    echo "🚀 Restarting Termux backup..."

    "$PROJECT_DIR/scripts/ashennai-control.sh" termux-on

    echo "✅ Termux backup restarted."

else

    echo "📱 Termux remains OFFLINE."
fi

echo "☁️ Waiting for Render..."

RENDER_VERSION=""

for ((i=1; i<=MAX_CHECKS; i++)); do

    echo "🔎 Render check $i/$MAX_CHECKS..."

    RESPONSE="$(
        curl -fsS \
        --max-time 15 \
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

        echo "⏳ Render version: ${RENDER_VERSION:-unknown}"

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
    echo "📱 Termux:  $TERMUX_VERSION ✅"
    echo "🛡️ Failover: AUTO"
    echo "================================="

else

    echo "⚠️ RENDER DEPLOYMENT NOT VERIFIED"
    echo "================================="
    echo "🐙 GitHub:  $VERSION ✅"
    echo "📱 Termux:  $TERMUX_VERSION ✅"
    echo "☁️ Render:  ${RENDER_VERSION:-UNKNOWN} ⚠️"
    echo "================================="

    exit 1

fi
