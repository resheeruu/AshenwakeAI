#!/data/data/com.termux/files/usr/bin/bash

PROJECT_DIR="$HOME/AshenAI"
BRANCH="main"
DEBOUNCE=5

cd "$PROJECT_DIR" || exit 1

echo "================================="
echo "🔥 AshenAI Auto-Sync"
echo "================================="
echo "📱 Termux → GitHub → Render"
echo "🧪 Build before deployment"
echo ""

while true; do

    echo "👀 Watching AshenAI files..."

    inotifywait -r -e modify,create,delete,move \
        "$PROJECT_DIR/src" \
        "$PROJECT_DIR/scripts" \
        "$PROJECT_DIR/package.json" \
        "$PROJECT_DIR/tsconfig.json" \
        >/dev/null 2>&1

    echo "📝 Change detected..."
    sleep "$DEBOUNCE"

    cd "$PROJECT_DIR" || exit 1

    echo "🧪 Running build..."

    if ! npm run build; then
        echo "❌ Build failed."
        echo "🚫 NOT pushing to GitHub."
        echo "⚠️ Fix the error before deployment."
        continue
    fi

    echo "✅ Build successful."

    if [ -z "$(git status --porcelain)" ]; then
        echo "ℹ️ No Git changes to push."
        continue
    fi

    echo "📦 Adding changes..."

    git add .

    if git diff --cached --quiet; then
        echo "ℹ️ Nothing staged."
        continue
    fi

    COMMIT_MESSAGE="Auto-update AshenAI $(date '+%Y-%m-%d %H:%M:%S')"

    echo "📝 Creating commit:"
    echo "$COMMIT_MESSAGE"

    if ! git commit -m "$COMMIT_MESSAGE"; then
        echo "❌ Commit failed."
        continue
    fi

    echo "🐙 Pushing to GitHub..."

    if ! git push origin "$BRANCH"; then
        echo "❌ GitHub push failed."
        continue
    fi

    echo ""
    echo "================================="
    echo "🚀 UPDATE DEPLOYED TO GITHUB"
    echo "================================="
    echo "☁️ Render will automatically deploy."
    echo ""

done
