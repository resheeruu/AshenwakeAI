#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
BRANCH="main"
HEALTH_URL="https://ashenwakeai.onrender.com/api/health"

cd "$PROJECT_DIR" || exit 1

echo "================================="
echo "🔥 AshenAI Deployment Controller"
echo "================================="

echo "🧪 Running build..."

if ! npm run build; then
    echo "❌ Build failed."
    echo "🚫 Deployment cancelled."
    exit 1
fi

echo "✅ Build successful."

if [ -z "$(git status --porcelain)" ]; then
    echo "ℹ️ No changes detected."
    exit 0
fi

git add .

COMMIT_MESSAGE="Update AshenAI $(date '+%Y-%m-%d %H:%M:%S')"

if ! git commit -m "$COMMIT_MESSAGE"; then
    echo "❌ Commit failed."
    exit 1
fi

EXPECTED_VERSION="$(git rev-parse --short HEAD)"

echo "📌 New version: $EXPECTED_VERSION"
echo "🐙 Pushing to GitHub..."

if ! git push origin "$BRANCH"; then
    echo "❌ GitHub push failed."
    exit 1
fi

echo "✅ GitHub updated."
echo "☁️ Waiting for Render deployment..."

get_render_version() {
    curl -sS \
        --max-time 15 \
        "$HEALTH_URL" |
        grep -o '"version":"[^"]*"' |
        head -n 1 |
        cut -d '"' -f 4
}

for attempt in 1 2 3 4 5 6 7 8 9 10; do

    echo "🔎 Render check $attempt/10..."

    RENDER_VERSION="$(get_render_version || true)"

    if [ "$RENDER_VERSION" = "$EXPECTED_VERSION" ]; then
        echo "================================="
        echo "✅ DEPLOYMENT VERIFIED"
        echo "================================="
        echo "🐙 GitHub: $EXPECTED_VERSION"
        echo "☁️ Render: $RENDER_VERSION"
        echo "🔐 Version match confirmed."
        exit 0
    fi

    if [ -n "$RENDER_VERSION" ]; then
        echo "   Render currently running: $RENDER_VERSION"
        echo "   Waiting for: $EXPECTED_VERSION"
    else
        echo "   Render health endpoint unavailable."
    fi

    sleep 15
done

echo ""
echo "⚠️ Render did not reach the expected version."

if [ -n "${RENDER_DEPLOY_HOOK:-}" ]; then

    echo "🚀 Triggering emergency Render deployment..."

    HOOK_CODE="$(
        curl \
            --silent \
            --show-error \
            --output /dev/null \
            --write-out "%{http_code}" \
            --max-time 20 \
            --request POST \
            "$RENDER_DEPLOY_HOOK"
    )"

    if [ "$HOOK_CODE" = "200" ] ||
       [ "$HOOK_CODE" = "201" ] ||
       [ "$HOOK_CODE" = "202" ]; then

        echo "✅ Emergency deployment triggered."
        echo "🔎 Render will be checked again by the failover monitor."

    else
        echo "❌ Emergency deployment failed."
        echo "HTTP status: $HOOK_CODE"
    fi

else

    echo "❌ Render Deploy Hook is not loaded."
    echo "Run:"
    echo "source ~/.ashennai-secrets"

fi

echo ""
echo "⚠️ Deployment could not be verified."
exit 1
