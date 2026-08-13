#!/data/data/com.termux/files/usr/bin/bash

PROJECT_DIR="$HOME/AshenAI"
MODE_FILE="$PROJECT_DIR/.ashennai-mode"
PID_FILE="$PROJECT_DIR/.termux-backup.pid"
FAILOVER_PID_FILE="$PROJECT_DIR/.failover-monitor.pid"
RENDER_URL="https://ashenwakeai.onrender.com/api/health"

mode() {
    [ -f "$MODE_FILE" ] && cat "$MODE_FILE" || echo "AUTO"
}

set_mode() {
    echo "$1" > "$MODE_FILE"
    echo "✅ Mode changed to: $1"
}

termux_on() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "📱 Termux already ONLINE"
        return
    fi

    cd "$PROJECT_DIR" || exit 1
    bash "$PROJECT_DIR/scripts/failover-run.sh" >> "$PROJECT_DIR/termux-backup.log" 2>&1 &
    echo $! > "$PID_FILE"
    echo "📱 Termux backup STARTED"
}

termux_off() {
    if [ -f "$PID_FILE" ]; then
        PID="$(cat "$PID_FILE")"
        kill "$PID" 2>/dev/null || true
        rm -f "$PID_FILE"
    fi

    echo "📱 Termux backup STOPPED"
}

failover_on() {
    if [ -f "$FAILOVER_PID_FILE" ] &&
       kill -0 "$(cat "$FAILOVER_PID_FILE")" 2>/dev/null; then
        echo "🛡️ Failover already ONLINE"
        return
    fi

    nohup "$PROJECT_DIR/scripts/failover.sh" \
        > "$PROJECT_DIR/failover-monitor.log" 2>&1 &

    echo $! > "$FAILOVER_PID_FILE"
    echo "🛡️ Failover monitor STARTED"
}

failover_off() {
    if [ -f "$FAILOVER_PID_FILE" ]; then
        PID="$(cat "$FAILOVER_PID_FILE")"
        kill "$PID" 2>/dev/null || true
        rm -f "$FAILOVER_PID_FILE"
    fi

    pkill -f "$PROJECT_DIR/scripts/failover.sh" 2>/dev/null || true
    echo "🛡️ Failover monitor STOPPED"
}

render_status() {
    if curl -fsS --max-time 10 "$RENDER_URL" >/dev/null 2>&1; then
        echo "☁️ Render: ONLINE"
    else
        echo "☁️ Render: OFFLINE"
    fi
}

status() {
    echo "================================="
    echo "🔥 ASHENAI CONTROL STATUS"
    echo "================================="
    echo "🎛️ Mode: $(mode)"

    render_status

    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "📱 Termux: ONLINE"
    else
        echo "📱 Termux: OFFLINE"
    fi

    if pgrep -f "$PROJECT_DIR/scripts/failover.sh" >/dev/null 2>&1; then
        echo "🛡️ Failover: ONLINE"
    else
        echo "🛡️ Failover: OFFLINE"
    fi

    echo "🐙 Git: $(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    echo "================================="
}

case "${1:-status}" in
    render-on)
        set_mode "RENDER-ONLY"
        termux_off
        echo "☁️ Render-only mode enabled"
        ;;
    render-off)
        set_mode "TERMUX-ONLY"
        failover_off
        termux_on
        echo "☁️ Render disabled from automatic failover"
        ;;
    termux-on)
        termux_on
        ;;
    termux-off)
        termux_off
        ;;
    auto)
        set_mode "AUTO"
        failover_on
        echo "🛡️ Automatic failover enabled"
        ;;
    failover-on)
        failover_on
        ;;
    failover-off)
        failover_off
        ;;
    status)
        status
        ;;
    *)
        echo "Usage:"
        echo "  $0 status"
        echo "  $0 auto"
        echo "  $0 render-on"
        echo "  $0 render-off"
        echo "  $0 termux-on"
        echo "  $0 termux-off"
        echo "  $0 failover-on"
        echo "  $0 failover-off"
        ;;
esac
