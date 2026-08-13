#!/data/data/com.termux/files/usr/bin/bash

set -u

PROJECT_DIR="$HOME/AshenAI"
RENDER_URL="https://ashenwakeai.onrender.com/api/health"

CHECK_INTERVAL=2
DEBOUNCE=5
RETRY_INTERVAL=5
RENDER_CHECK_INTERVAL=5

PENDING_FILE="$PROJECT_DIR/.ashennai-pending-deploy"
PID_FILE="$PROJECT_DIR/.ashennai-supervisor.pid"

LOG_FILE="$PROJECT_DIR/ashennai-supervisor.log"

cd "$PROJECT_DIR" || exit 1

# Prevent duplicate supervisor
if [ -f "$PID_FILE" ]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"

    if [ -n "$OLD_PID" ] &&
       kill -0 "$OLD_PID" 2>/dev/null; then
        echo "🔥 AshenAI supervisor already running."
        exit 0
    fi
fi

echo $$ > "$PID_FILE"

cleanup() {
    rm -f "$PID_FILE"
}

trap cleanup EXIT INT TERM

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

changes() {
    git status --porcelain
}

online() {
    git ls-remote origin main >/dev/null 2>&1
}

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

commit_changes() {

    if [ -z "$(changes)" ]; then
        return 0
    fi

    git add -A

    if git commit \
        -m "Auto update AshenAI $(date '+%Y-%m-%d %H:%M:%S')" \
        >/dev/null 2>&1; then

        VERSION="$(git rev-parse --short HEAD)"

        log "💾 Local commit: $VERSION"

        echo "$VERSION" > "$PENDING_FILE"

        return 0
    fi

    log "❌ Commit failed."

    return 1
}

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
        log "🔄 Will retry."
        return 1
    fi

    VERSION="$(git rev-parse --short HEAD)"

    rm -f "$PENDING_FILE"

    log "✅ GitHub updated: $VERSION"
    log "☁️ Render deployment triggered."

    return 0
}

render_version() {

    RESPONSE="$(
        curl -fsS \
        --max-time 10 \
        "$RENDER_URL" \
        2>/dev/null || true
    )"

    if [ -z "$RESPONSE" ]; then
        return 1
    fi

    printf '%s' "$RESPONSE" |
        sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

verify_render() {

    VERSION="$1"

    RENDER=""

    for i in 1 2 3 4 5 6 7 8 9 10 11 12; do

        RENDER="$(render_version || true)"

        if [ "$RENDER" = "$VERSION" ]; then
            log "☁️ Render synchronized: $VERSION"
            return 0
        fi

        sleep "$RENDER_CHECK_INTERVAL"

    done

    log "⚠️ Render not yet synchronized."

    return 1
}

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

log "================================="
log "🔥 ASHENAI FINAL SYSTEM STARTED"
log "================================="
log "⚡ Auto-deploy: ON"
log "🛡️ Failover: ON"
log "📦 Offline queue: ON"
log "🔄 Auto retry: ON"
log "☁️ Render verification: ON"
log "================================="

LAST_STATE="$(changes)"

while true; do

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
