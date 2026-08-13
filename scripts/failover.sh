#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
RENDER_URL="https://ashenwakeai.onrender.com/api/health"
PID_FILE="$PROJECT_DIR/.termux-backup.pid"
LOG_FILE="$PROJECT_DIR/termux-backup.log"

FAILURES=0
MAX_FAILURES=3
CHECK_INTERVAL=60

echo "================================="
echo "☁️ AshenAI Failover Monitor"
echo "================================="
echo "☁️ Primary: Render"
echo "📱 Backup: Termux"
echo ""

start_backup() {
    if [ -f "$PID_FILE" ]; then
        PID="$(cat "$PID_FILE")"

        if kill -0 "$PID" 2>/dev/null; then
            echo "📱 Termux backup already running. PID: $PID"
            return
        fi

        rm -f "$PID_FILE"
    fi

    echo "📱 Render unavailable."
    echo "🚀 Starting Termux backup..."

    cd "$PROJECT_DIR" || exit 1

    bash "$PROJECT_DIR/scripts/failover-run.sh" \
        >> "$LOG_FILE" 2>&1 &

    echo $! > "$PID_FILE"

    echo "📱 Termux backup starting. PID: $(cat "$PID_FILE")"
}

stop_backup() {
    if [ ! -f "$PID_FILE" ]; then
        return
    fi

    PID="$(cat "$PID_FILE")"

    if kill -0 "$PID" 2>/dev/null; then
        echo "🔄 Render recovered — stopping Termux backup..."
        kill "$PID" 2>/dev/null || true
    fi

    rm -f "$PID_FILE"
}

while true; do

    if curl -fsS \
        --max-time 15 \
        "$RENDER_URL" >/dev/null 2>&1; then

        FAILURES=0

        echo "[$(date '+%H:%M:%S')] ☁️ Render ONLINE"

        stop_backup

        echo "[$(date '+%H:%M:%S')] 📱 Termux STANDBY"

    else

        FAILURES=$((FAILURES + 1))

        echo "[$(date '+%H:%M:%S')] ⚠️ Render failed: $FAILURES/$MAX_FAILURES"

        if [ "$FAILURES" -ge "$MAX_FAILURES" ]; then

            echo "[$(date '+%H:%M:%S')] 🚨 Render appears OFFLINE"

            start_backup

            FAILURES=0
        fi
    fi

    sleep "$CHECK_INTERVAL"
done
