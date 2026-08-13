#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
LOG_FILE="$PROJECT_DIR/anomaly-monitor.log"
ALERT_FILE="$PROJECT_DIR/.ashennai-anomaly"
PID_FILE="$PROJECT_DIR/.anomaly-monitor.pid"

RENDER_URL="https://ashenwakeai.onrender.com/api/health"

CHECK_INTERVAL=10

cd "$PROJECT_DIR" || exit 1

# ==============================
# DUPLICATE PROTECTION
# ==============================

if [ -f "$PID_FILE" ]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"

    if [ -n "$OLD_PID" ] &&
       kill -0 "$OLD_PID" 2>/dev/null; then
        exit 0
    fi
fi

echo $$ > "$PID_FILE"

cleanup() {
    rm -f "$PID_FILE"
}

trap cleanup EXIT INT TERM

# ==============================
# LOGGING
# ==============================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

anomaly() {
    MESSAGE="$1"

    echo "$MESSAGE" > "$ALERT_FILE"

    log "🚨 ANOMALY: $MESSAGE"
}

clear_anomaly() {
    if [ -f "$ALERT_FILE" ]; then
        rm -f "$ALERT_FILE"
        log "✅ ANOMALY CLEARED"
    fi
}

# ==============================
# RENDER CHECK
# ==============================

check_render() {

    RESPONSE="$(
        curl -fsS \
        --max-time 10 \
        "$RENDER_URL" \
        2>/dev/null || true
    )"

    if [ -z "$RESPONSE" ]; then
        anomaly "Render health endpoint unavailable"
        return 1
    fi

    if ! printf '%s' "$RESPONSE" | grep -q '"ok":true'; then
        anomaly "Render returned unhealthy status"
        return 1
    fi

    return 0
}

# ==============================
# BUILD CHECK
# ==============================

check_build() {

    if [ ! -d "$PROJECT_DIR/dist" ]; then
        anomaly "Build directory missing"
        return 1
    fi

    return 0
}

# ==============================
# GIT CHECK
# ==============================

check_git() {

    if ! git -C "$PROJECT_DIR" diff --check >/dev/null 2>&1; then
        anomaly "Git detected invalid working-tree changes"
        return 1
    fi

    return 0
}

# ==============================
# PROCESS CHECK
# ==============================

check_processes() {

    COUNT="$(
        pgrep -f "src/index.ts" 2>/dev/null |
        wc -l
    )"

    if [ "$COUNT" -gt 1 ]; then
        anomaly "Multiple AshenAI processes detected: $COUNT"
        return 1
    fi

    return 0
}

# ==============================
# START
# ==============================

log "================================="
log "🔎 ASHENAI ANOMALY MONITOR"
log "================================="
log "⚡ Monitor started"
log "🌐 Render monitoring: ON"
log "🧪 Build monitoring: ON"
log "🐙 Git monitoring: ON"
log "📱 Process monitoring: ON"

# ==============================
# MAIN LOOP
# ==============================

while true; do

    HEALTHY=true

    check_render || HEALTHY=false
    check_build || HEALTHY=false
    check_git || HEALTHY=false
    check_processes || HEALTHY=false

    if [ "$HEALTHY" = true ]; then
        clear_anomaly
    fi

    sleep "$CHECK_INTERVAL"

done
