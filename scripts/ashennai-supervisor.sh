#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
RENDER_URL="https://ashenwakeai.onrender.com/api/health"

CHECK_INTERVAL=2
DEBOUNCE=5
RETRY_INTERVAL=5
RENDER_CHECK_INTERVAL=5

SUPERVISOR_PID="$PROJECT_DIR/.ashennai-supervisor.pid"
ANOMALY_PID="$PROJECT_DIR/.anomaly-monitor.pid"
PENDING_FILE="$PROJECT_DIR/.ashennai-pending-deploy"

LOG_FILE="$PROJECT_DIR/ashennai-supervisor.log"

cd "$PROJECT_DIR" || exit 1

# =================================
# DUPLICATE PROTECTION
# =================================

if [ -f "$SUPERVISOR_PID" ]; then

    OLD_PID="$(cat "$SUPERVISOR_PID" 2>/dev/null || true)"

    if [ -n "$OLD_PID" ] &&
       kill -0 "$OLD_PID" 2>/dev/null; then

        echo "🔥 AshenAI supervisor already running."
        exit 0
    fi

fi

echo $$ > "$SUPERVISOR_PID"

cleanup() {
    rm -f "$SUPERVISOR_PID"
}

trap cleanup EXIT INT TERM

# =================================
# LOGGING
# =================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" |
        tee -a "$LOG_FILE"
}

# =================================
# ANOMALY MONITOR
# =================================

anomaly_running() {

    if [ -f "$ANOMALY_PID" ]; then

        PID="$(cat "$ANOMALY_PID" 2>/dev/null || true)"

        if [ -n "$PID" ] &&
           kill -0 "$PID" 2>/dev/null; then
            return 0
        fi

    fi

    return 1
}

start_anomaly_monitor() {

    if anomaly_running; then
        return
    fi

    rm -f "$ANOMALY_PID"

    log "🔎 Starting anomaly monitor..."

    nohup "$PROJECT_DIR/scripts/anomaly-monitor.sh" \
        >> "$PROJECT_DIR/anomaly-monitor.log" 2>&1 &

    echo $! > "$ANOMALY_PID"

    log "✅ Anomaly monitor started: PID $(cat "$ANOMALY_PID")"
}

# =================================
# GIT
# =================================

changes() {
    git status --porcelain
}

online() {
    git ls-remote origin main >/dev/null 2>&1
}

# =================================
# BUILD
# =================================

build() {

    log "🧪 Building AshenAI..."

    if npm run build >/dev/null 2>&1; then
        log "✅ Build successful."
        return 0
    fi

    log "❌ BUILD FAILED"
    log "🚫 Nothing pushed."

    return 1
}

# =================================
# COMMIT
# =================================

commit_changes() {

    if [ -z "$(changes)" ]; then
        return 0
    fi

    git add -A

    if git commit \
        -m "Auto update AshenAI $(date '+%Y-%m-%d %H:%M:%S')" \
        >/dev/null 2>&1; then

        VERSION="$(git rev-parse --short HEAD)"

        echo "$VERSION" > "$PENDING_FILE"

        log "💾 Local commit: $VERSION"

        return 0
    fi

    log "❌ Git commit failed."

    return 1
}

# =================================
# PUSH
# =================================

push_pending() {

    [ -f "$PENDING_FILE" ] || return 0

    if ! online; then
        log "📴 Offline — deployment queued."
        return 1
    fi

    log "🌐 Internet ONLINE."
    log "⬆️ Pushing GitHub..."

    if ! git push origin main >/dev/null 2>&1; then

        log "⚠️ GitHub push failed."
        log "🔄 Retrying later."

        return 1
    fi

    VERSION="$(git rev-parse --short HEAD)"

    rm -f "$PENDING_FILE"

    log "✅ GitHub updated: $VERSION"
    log "☁️ Render deployment triggered."

    return 0
}

# =================================
# RENDER
# =================================

render_version() {

    RESPONSE="$(
        curl -fsS \
        --max-time 10 \
        "$RENDER_URL" \
        2>/dev/null || true
    )"

    [ -n "$RESPONSE" ] || return 1

    printf '%s' "$RESPONSE" |
        sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

verify_render() {

    VERSION="$1"

    for i in $(seq 1 12); do

        RENDER="$(render_version || true)"

        if [ "$RENDER" = "$VERSION" ]; then

            log "☁️ Render synchronized: $VERSION"

            return 0
        fi

        log "⏳ Render check $i/12: ${RENDER:-UNKNOWN}"

        sleep "$RENDER_CHECK_INTERVAL"

    done

    log "⚠️ Render synchronization not verified."

    return 1
}

# =================================
# DEPLOY
# =================================

auto_deploy() {

    log "⚡ CHANGE DETECTED"
    log "⏳ Waiting ${DEBOUNCE}s..."

    sleep "$DEBOUNCE"

    if [ -z "$(changes)" ]; then
        return
    fi

    if ! build; then
        return
    fi

    if ! commit_changes; then
        return
    fi

    if push_pending; then

        VERSION="$(git rev-parse --short HEAD)"

        verify_render "$VERSION" || true

    fi
}

# =================================
# START
# =================================

log "================================="
log "🔥 ASHENAI ULTIMATE SUPERVISOR"
log "================================="
log "⚡ Auto-deploy: ON"
log "🧪 Build protection: ON"
log "📦 Offline queue: ON"
log "🌐 Auto retry: ON"
log "☁️ Render verification: ON"
log "🔎 Anomaly detection: ON"
log "🛡️ Duplicate protection: ON"
log "================================="

start_anomaly_monitor

LAST_STATE="$(changes)"

# =================================
# MAIN LOOP
# =================================

while true; do

    # Keep anomaly monitor alive
    start_anomaly_monitor

    CURRENT_STATE="$(changes)"

    if [ "$CURRENT_STATE" != "$LAST_STATE" ]; then

        LAST_STATE="$CURRENT_STATE"

        if [ -n "$CURRENT_STATE" ]; then
            auto_deploy
        fi

        LAST_STATE="$(changes)"

    fi

    if [ -f "$PENDING_FILE" ]; then
        push_pending || true
    fi

    sleep "$CHECK_INTERVAL"

done
