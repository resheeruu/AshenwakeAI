#!/usr/bin/env bash
# ============================================================
# check-resources.sh
#
# Lightweight startup resource check for constrained hosting.
# Reports disk, RAM, and CPU status using POSIX-compatible tools.
#
# Output format:
#   [RESOURCE] Disk: 1.82 GB free / 5.00 GB (36.4%) OK
#   [RESOURCE] RAM: 286 MB RSS / 512 MB available (55.9%) OK
#   [RESOURCE] CPU: load 0.42 OK
#
# Exit code: always 0 (never crashes startup).
# Side effects: exports ASHENAI_RESOURCE_DISK_STATE, ASHENAI_RESOURCE_RAM_STATE,
#               ASHENAI_RESOURCE_CPU_STATE, ASHENAI_RESOURCE_DISK_FREE_MB
# ============================================================

set -euo pipefail

# ---------- Configuration (override via env) ----------

DISK_WARN_MB="${ASHENAI_RESOURCE_DISK_WARN_MB:-100}"
DISK_CRITICAL_MB="${ASHENAI_RESOURCE_DISK_CRITICAL_MB:-50}"
DISK_WARN_PCT="${ASHENAI_RESOURCE_DISK_WARN_PERCENT:-20}"
DISK_CRITICAL_PCT="${ASHENAI_RESOURCE_DISK_CRITICAL_PERCENT:-5}"

RAM_WARN_PCT="${ASHENAI_RESOURCE_RAM_WARN_PERCENT:-80}"
RAM_CRITICAL_PCT="${ASHENAI_RESOURCE_RAM_CRITICAL_PERCENT:-90}"

CPU_WARN_LOAD="${ASHENAI_RESOURCE_CPU_WARN_LOAD:-4}"

# ---------- Defaults for exports ----------

export ASHENAI_RESOURCE_DISK_STATE="UNAVAILABLE"
export ASHENAI_RESOURCE_RAM_STATE="UNAVAILABLE"
export ASHENAI_RESOURCE_CPU_STATE="UNAVAILABLE"
export ASHENAI_RESOURCE_DISK_FREE_MB="0"

# ---------- Helpers ----------

log() {
  echo "[RESOURCE] $*"
}

# Classify disk state based on free MB and free percent
classify_disk() {
  local free_mb="$1"
  local free_pct="$2"

  # Critical: either absolute or percentage threshold
  if [ "$free_mb" -lt "$DISK_CRITICAL_MB" ] || [ "$(echo "$free_pct < $DISK_CRITICAL_PCT" | bc 2>/dev/null || echo 0)" -eq 1 ]; then
    echo "CRITICAL"
    return
  fi

  # Warning: either absolute or percentage threshold
  if [ "$free_mb" -lt "$DISK_WARN_MB" ] || [ "$(echo "$free_pct < $DISK_WARN_PCT" | bc 2>/dev/null || echo 0)" -eq 1 ]; then
    echo "WARN"
    return
  fi

  echo "OK"
}

# Classify RAM state based on available percent used
classify_ram() {
  local used_pct="$1"

  if [ "$(echo "$used_pct > $RAM_CRITICAL_PCT" | bc 2>/dev/null || echo 0)" -eq 1 ]; then
    echo "CRITICAL"
    return
  fi

  if [ "$(echo "$used_pct > $RAM_WARN_PCT" | bc 2>/dev/null || echo 0)" -eq 1 ]; then
    echo "WARN"
    return
  fi

  echo "OK"
}

# Classify CPU state based on load average
classify_cpu() {
  local load="$1"

  if [ "$(echo "$load > $CPU_WARN_LOAD" | bc 2>/dev/null || echo 0)" -eq 1 ]; then
    echo "WARN"
    return
  fi

  echo "OK"
}

# Format bytes to human-readable
format_bytes() {
  local bytes="$1"
  if [ "$bytes" -ge 1073741824 ]; then
    echo "$(echo "scale=2; $bytes / 1073741824" | bc 2>/dev/null || echo "0") GB"
  elif [ "$bytes" -ge 1048576 ]; then
    echo "$(echo "scale=0; $bytes / 1048576" | bc 2>/dev/null || echo "0") MB"
  else
    echo "${bytes} B"
  fi
}

# ---------- Disk Check ----------

check_disk() {
  local target_path="${APP_DIR:-.}"

  # Try df (POSIX standard)
  local df_output
  if df_output=$(df -P "$target_path" 2>/dev/null); then
    local line
    line=$(echo "$df_output" | awk 'NR==2 {print $2, $3, $4}')
    if [ -n "$line" ]; then
      local total_kb used_kb free_kb
      total_kb=$(echo "$line" | awk '{print $1}')
      used_kb=$(echo "$line" | awk '{print $2}')
      free_kb=$(echo "$line" | awk '{print $3}')

      if [ -n "$total_kb" ] && [ "$total_kb" -gt 0 ] 2>/dev/null; then
        local total_mb free_mb used_pct free_pct
        total_mb=$(( total_kb / 1024 ))
        free_mb=$(( free_kb / 1024 ))
        used_pct=$(echo "scale=1; ($total_kb - $free_kb) * 100 / $total_kb" | bc 2>/dev/null || echo "0")
        free_pct=$(echo "scale=1; $free_kb * 100 / $total_kb" | bc 2>/dev/null || echo "100")

        export ASHENAI_RESOURCE_DISK_FREE_MB="$free_mb"
        ASHENAI_RESOURCE_DISK_STATE=$(classify_disk "$free_mb" "$free_pct")
        export ASHENAI_RESOURCE_DISK_STATE

        local total_fmt free_fmt
        total_fmt=$(format_bytes "$((total_kb * 1024))")
        free_fmt=$(format_bytes "$((free_kb * 1024))")

        log "Disk: ${free_fmt} free / ${total_fmt} (${free_pct}%) ${ASHENAI_RESOURCE_DISK_STATE}"
        return
      fi
    fi
  fi

  # Fallback: statfs via node if available
  if command -v node >/dev/null 2>&1; then
    local node_result
    node_result=$(node -e "
      try {
        const fs = require('fs');
        const { statfsSync } = fs;
        if (typeof statfsSync === 'function') {
          const s = statfsSync('${target_path}');
          const bsize = s.bsize || s.blksize || 4096;
          const total = s.blocks * bsize;
          const free = s.bavail * bsize;
          const pct = total > 0 ? ((total - free) / total * 100).toFixed(1) : '0';
          const freePct = total > 0 ? (free / total * 100).toFixed(1) : '100';
          console.log(JSON.stringify({ total, free, pct, freePct }));
        } else {
          console.log('null');
        }
      } catch { console.log('null'); }
    " 2>/dev/null || echo "null")

    if [ "$node_result" != "null" ] && [ -n "$node_result" ]; then
      local total_b free_b pct free_pct
      total_b=$(echo "$node_result" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.total)" 2>/dev/null || echo "0")
      free_b=$(echo "$node_result" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.free)" 2>/dev/null || echo "0")
      free_pct=$(echo "$node_result" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.freePct)" 2>/dev/null || echo "100")

      if [ "$total_b" -gt 0 ] 2>/dev/null; then
        local total_mb free_mb
        total_mb=$(( total_b / 1048576 ))
        free_mb=$(( free_b / 1048576 ))

        export ASHENAI_RESOURCE_DISK_FREE_MB="$free_mb"
        ASHENAI_RESOURCE_DISK_STATE=$(classify_disk "$free_mb" "$free_pct")
        export ASHENAI_RESOURCE_DISK_STATE

        local total_fmt free_fmt
        total_fmt=$(format_bytes "$total_b")
        free_fmt=$(format_bytes "$free_b")

        log "Disk: ${free_fmt} free / ${total_fmt} (${free_pct}%) ${ASHENAI_RESOURCE_DISK_STATE}"
        return
      fi
    fi
  fi

  log "Disk: unavailable"
  export ASHENAI_RESOURCE_DISK_STATE="UNAVAILABLE"
}

# ---------- RAM Check ----------

check_ram() {
  local available_mb=0
  local total_mb=0
  local rss_mb=0
  local heap_mb=0

  # Try /proc/meminfo (Linux standard)
  if [ -f "/proc/meminfo" ]; then
    local mem_total mem_available
    mem_total=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
    mem_available=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")

    # Fallback: compute from free+buffers+cached if MemAvailable not present
    if [ "$mem_available" = "0" ] || [ -z "$mem_available" ]; then
      local mem_free mem_buffers mem_cached
      mem_free=$(awk '/^MemFree:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
      mem_buffers=$(awk '/^Buffers:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
      mem_cached=$(awk '/^Cached:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
      mem_available=$(( mem_free + mem_buffers + mem_cached ))
    fi

    if [ "$mem_total" -gt 0 ] 2>/dev/null; then
      total_mb=$(( mem_total / 1024 ))
      available_mb=$(( mem_available / 1024 ))
    fi
  fi

  # Try free command (if /proc/meminfo unavailable)
  if [ "$total_mb" -eq 0 ] && command -v free >/dev/null 2>&1; then
    local free_output
    free_output=$(free -m 2>/dev/null || true)
    if [ -n "$free_output" ]; then
      total_mb=$(echo "$free_output" | awk '/^Mem:/ {print $2}' || echo "0")
      available_mb=$(echo "$free_output" | awk '/^Mem:/ {print $7}' || echo "0")
      # Some 'free' versions don't have column 7; fall back to column 4 (available in newer) or column 2 - column 1
      if [ "$available_mb" = "0" ] || [ -z "$available_mb" ]; then
        available_mb=$(echo "$free_output" | awk '/^Mem:/ {print $4}' || echo "0")
      fi
    fi
  fi

  # Get Node.js process memory if available
  if command -v node >/dev/null 2>&1; then
    local proc_mem
    proc_mem=$(node -e "const m=process.memoryUsage();console.log(JSON.stringify({rss:m.rss,heap:m.heapUsed}))" 2>/dev/null || echo "{}")
    rss_mb=$(echo "$proc_mem" | node -e "try{const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(Math.round(j.rss/1048576))}catch{console.log(0)}" 2>/dev/null || echo "0")
    heap_mb=$(echo "$proc_mem" | node -e "try{const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(Math.round(j.heap/1048576))}catch{console.log(0)}" 2>/dev/null || echo "0")
  fi

  # Classify
  if [ "$total_mb" -gt 0 ] && [ "$available_mb" -gt 0 ]; then
    local used_pct
    used_pct=$(echo "scale=1; ($total_mb - $available_mb) * 100 / $total_mb" | bc 2>/dev/null || echo "0")

    ASHENAI_RESOURCE_RAM_STATE=$(classify_ram "$used_pct")
    export ASHENAI_RESOURCE_RAM_STATE

    if [ "$rss_mb" -gt 0 ]; then
      log "RAM: ${rss_mb} MB RSS / ${available_mb} MB available (${used_pct}% used) ${ASHENAI_RESOURCE_RAM_STATE}"
    else
      log "RAM: ${available_mb} MB available / ${total_mb} MB total (${used_pct}% used) ${ASHENAI_RESOURCE_RAM_STATE}"
    fi
  elif [ "$rss_mb" -gt 0 ]; then
    # Process-only fallback
    ASHENAI_RESOURCE_RAM_STATE="OK"
    export ASHENAI_RESOURCE_RAM_STATE
    log "RAM: ${rss_mb} MB RSS (system info unavailable) ${ASHENAI_RESOURCE_RAM_STATE}"
  else
    log "RAM: unavailable"
    export ASHENAI_RESOURCE_RAM_STATE="UNAVAILABLE"
  fi
}

# ---------- CPU Check ----------

check_cpu() {
  local load=""

  # Try /proc/loadavg (Linux standard)
  if [ -f "/proc/loadavg" ]; then
    load=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "")
  fi

  # Try uptime parsing (POSIX fallback)
  if [ -z "$load" ] && command -v uptime >/dev/null 2>&1; then
    load=$(uptime 2>/dev/null | sed -n 's/.*load average[s]*: *\([0-9.]*\).*/\1/p' || echo "")
  fi

  if [ -n "$load" ]; then
    ASHENAI_RESOURCE_CPU_STATE=$(classify_cpu "$load")
    export ASHENAI_RESOURCE_CPU_STATE
    log "CPU: load ${load} ${ASHENAI_RESOURCE_CPU_STATE}"
  else
    log "CPU: unavailable"
    export ASHENAI_RESOURCE_CPU_STATE="UNAVAILABLE"
  fi
}

# ---------- Main ----------

main() {
  check_disk
  check_ram
  check_cpu
}

main
