#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
BRANCH="main"

cd "$PROJECT_DIR" || exit 1

echo "================================="
echo "🔥 AshenAI Update Controller"
echo "================================="

echo "🧪 Checking TypeScript build..."

if ! npm run build; then
    echo "❌ Build failed."
    echo "🚫 Update cancelled."
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

echo "🐙 Pushing to GitHub..."

if ! git push origin "$BRANCH"; then
    echo "❌ GitHub push failed."
    exit 1
fi

echo "✅ GitHub updated."
echo "☁️ Render should automatically deploy the new commit."

echo ""
echo "🔎 Waiting briefly for Render..."
sleep 10

if [ -n "${RENDER_DEPLOY_HOOK:-}" ]; then
    echo "ℹ️ Emergency Render hook available."
    echo "   Use ./scripts/render-deploy.sh if Render does not start."
else
    echo "⚠️ Render hook is not loaded in this shell."
fi

echo ""
echo "================================="
echo "✅ UPDATE COMPLETE"
echo "================================="
