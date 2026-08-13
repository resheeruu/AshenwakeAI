#!/data/data/com.termux/files/usr/bin/bash

set -u

echo "================================="
echo "☁️ AshenAI Render Deployer"
echo "================================="

if [ -z "${RENDER_DEPLOY_HOOK:-}" ]; then
    echo "❌ Render Deploy Hook is not loaded."
    echo ""
    echo "Run:"
    echo "source ~/.ashennai-secrets"
    echo ""
    exit 1
fi

echo "☁️ Render Deploy Hook detected."
echo "🚀 Triggering deployment..."
echo ""

HTTP_CODE="$(
    curl \
        --silent \
        --show-error \
        --output /dev/null \
        --write-out "%{http_code}" \
        --request POST \
        "$RENDER_DEPLOY_HOOK"
)"

if [ "$HTTP_CODE" = "200" ] ||
   [ "$HTTP_CODE" = "201" ] ||
   [ "$HTTP_CODE" = "202" ]; then

    echo "================================="
    echo "✅ Render deployment triggered!"
    echo "================================="
    echo "📦 Render will deploy the latest commit."
    echo ""

    exit 0
fi

echo "================================="
echo "❌ Render deployment failed"
echo "================================="
echo "HTTP status: $HTTP_CODE"
echo ""

exit 1
