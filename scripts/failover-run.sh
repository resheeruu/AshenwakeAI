#!/data/data/com.termux/files/usr/bin/bash

PROJECT_DIR="$HOME/AshenAI"
PID_FILE="$PROJECT_DIR/.termux-backup.pid"
LOG_FILE="$PROJECT_DIR/termux-backup.log"

cd "$PROJECT_DIR" || exit 1

echo "[$(date)] 📱 Termux backup starting" >> "$LOG_FILE"

echo "🔄 Pulling latest AshenAI from GitHub..."

if ! git pull --ff-only origin main >> "$LOG_FILE" 2>&1; then
    echo "❌ GitHub update failed."
    echo "❌ Termux backup will NOT start."
    exit 1
fi

echo "🧪 Building latest version..."

if ! npm run build >> "$LOG_FILE" 2>&1; then
    echo "❌ Build failed."
    echo "❌ Termux backup will NOT start."
    exit 1
fi

echo "✅ Latest version ready."

npm start >> "$LOG_FILE" 2>&1 &
PID=$!

echo "$PID" > "$PID_FILE"

echo "📱 Termux backup running with PID $PID"

wait "$PID"

rm -f "$PID_FILE"
