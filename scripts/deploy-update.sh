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
    echo "🚫 Nothing will be pushed."
    exit 1
fi

echo "✅ Build successful."

if [ -z "$(git status --porcelain)" ]; then
    echo "ℹ️ No changes detected."
    exit 0
fi

echo "📦 Preparing Git commit..."

git add .

COMMIT_MESSAGE="Update AshenAI $(date '+%Y-%m-%d %H:%M:%S')"

if ! git commit -m "$COMMIT_MESSAGE"; then
    echo "❌ Git commit failed."
    exit 1
fi

echo "🐙 Pushing to GitHub..."

if ! git push origin "$BRANCH"; then
    echo "❌ GitHub push failed."
    exit 1
fi

echo "✅ GitHub updated."
echo "☁️ Waiting for Render..."

check_render() {
    HTTP_CODE="$(
        curl \
            --silent \
            --show-error \
            --output /dev/null \
            --write-out "%{http_code}" \
            --max-time 15 \
            "$HEALTH_URL"
    )"

    [ "$HTTP_CODE" = "200" ]
}

echo "🔎 Checking Render..."

for attempt in 1 2 3 4 5 6; do

    echo "   Attempt $attempt/6..."

    if check_render; then
        echo "✅ Render is responding."
        break
    fi

    if [ "$attempt" = "6" ]; then
        echo "⚠️ Render did not respond normally."

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

                echo "✅ Emergency Render deployment triggered."
                echo "🔎 Waiting for Render recovery..."

            else
                echo "❌ Emergency deployment trigger failed."
                echo "HTTP status: $HOOK_CODE"
            fi
        else
            echo "⚠️ Render Deploy Hook is not loaded."
        fi

        break
    fi

    sleep 10
done

echo ""
echo "================================="
echo "✅ DEPLOYMENT PROCESS COMPLETE"
echo "================================="
echo "🐙 GitHub: UPDATED"
echo "☁️ Render: CHECKED"
echo "📱 Termux: READY AS BACKUP"
echo ""
