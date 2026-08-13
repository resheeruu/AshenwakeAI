#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
LOG_FILE="$PROJECT_DIR/anomaly-monitor.log"
ALERT_FILE="$PROJECT_DIR/.ashennai-anomaly"

RENDER_URL="https://ashenwakeai.onrender.com/api/health"

CHECK_INTERVAL=10

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

clear_alert() {
    rm -f "$ALERT_FILE"
}

alert() {
    MESSAGE="$1"

    echo "$MESSAGE" > "$ALERT_FILE"

    log "🚨 ANOMALY: $MESSAGE"
}

check_render() {

    RESPONSE="$(curl -fsS --max-time 10 "$RENDER_URL" 2>/dev/null || true)"

    if [ -z "$RESPONSE" ]; then
        alert "Render health endpoint unavailable"
        return 1
    fi

    return 0
}

check_build_state() {

    if [ ! -d "$PROJECT_DIR/dist" ]; then
        alert "Build output directory missing"
        return 1
    fi

    return 0
}

check_duplicate_processes() {

    COUNT="$(pgrep -f "src/index.ts" 2>/dev/null | wc -l)"

    if [ "$COUNT" -gt 1 ]; then
        alert "Multiple AshenAI processes detected: $COUNT"
        return 1
    fi

    return 0
}

check_git_state() {

    if ! git -C "$PROJECT_DIR" diff --check >/dev/null 2>&1; then
        alert "Git detected whitespace/errors in working tree"
        return 1
    fi

    return 0
}

log "================================="
log "🔎 ASHENAI ANOMALY MONITOR"
log "================================="
log "⚡ Monitoring started"

while true; do

    HEALTHY=true

    if ! check_render; then
        HEALTHY=false
    fi

    if ! check_build_state; then
        HEALTHY=false
    fi

    if ! check_duplicate_processes; then
        HEALTHY=false
    fi

    if ! check_git_state; then
        HEALTHY=false
    fi

    if [ "$HEALTHY" = true ]; then

        if [ -f "$ALERT_FILE" ]; then
            log "✅ Previous anomaly cleared"
            clear_alert
        fi

    fi

    sleep "$CHECK_INTERVAL"

done
