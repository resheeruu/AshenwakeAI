#!/usr/bin/env bash
# ============================================================
# check-resources.sh
#
# Lightweight startup resource check for constrained hosting.
# Reports disk, RAM, and CPU status using POSIX-compatible tools.
#
# STORAGE SEMANTICS (do NOT misinterpret):
#   1. Physical device storage — the real disk in the datacenter.
#   2. Host machine storage — what the host OS sees.
#   3. Container-visible filesystem capacity — what `df` reports
#      from inside the container (may be the host fs, an overlay
#      upperdir, or a mounted volume; NOT the account quota).
#   4. Hosting account/server quota — the limit Wispbyte imposes on
#      this server (often NOT visible via df/statfs from inside
#      the container).
#   5. Individual filesystem / writable-layer limits — overlay
#      upperdir size, /tmp (tmpfs) size, inode exhaustion, or
#      per-directory quotas that can raise ENOSPC even when `df`
#      on APP_DIR looks large.
#
# Therefore a large "Disk free" value MUST NEVER be presented as
# proof that the hosting account has sufficient allocated storage.
# When the platform does not expose the real quota, this script
# explicitly reports:
#   "Actual Wispbyte storage quota could not be verified from inside the container."
#
# This script only identifies the filesystem(s) actually used by:
#   - Playwright browser cache (PLAYWRIGHT_BROWSERS_PATH)
#   - npm cache (npm config get cache)
#   - temporary downloads (TMPDIR / /tmp)
#   - application runtime data (APP_DIR / HOME)
# It never deletes files to "fix" ENOSPC.
#
# Output format:
#   [RESOURCE] Disk: 1.82 GB free / 5.00 GB (36.4%) OK
#   [RESOURCE] Disk detail: path=... device=... mount=... free=... inodes_free=...
#   [RESOURCE] Disk note: df shows container-visible filesystem capacity, NOT hosting account/server quota.
#   [RESOURCE] RAM: 286 MB RSS / 512 MB available (55.9%) OK
#   [RESOURCE] CPU: load 0.42 OK
#
# Exit code: always 0 (never crashes startup).
# Side effects: exports ASHENAI_RESOURCE_DISK_STATE, ASHENAI_RESOURCE_RAM_STATE,
#               ASHENAI_RESOURCE_CPU_STATE, ASHENAI_RESOURCE_DISK_FREE_MB
#               (DISK_FREE_MB is the CONSERVATIVE MINIMUM across probed paths,
#               because ENOSPC is decided by the most constrained filesystem
#               in the download path, not by APP_DIR alone.)
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

# Classify disk state based on free MB and free percent (awk; no bc needed)
float_lt() {
  awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0 < b+0)}'
}
float_gt() {
  awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0 > b+0)}'
}
classify_disk() {
  local free_mb="$1"
  local free_pct="$2"

  # Critical: either absolute or percentage threshold
  if [ "$free_mb" -lt "$DISK_CRITICAL_MB" ] || float_lt "$free_pct" "$DISK_CRITICAL_PCT"; then
    echo "CRITICAL"
    return
  fi

  # Warning: either absolute or percentage threshold
  if [ "$free_mb" -lt "$DISK_WARN_MB" ] || float_lt "$free_pct" "$DISK_WARN_PCT"; then
    echo "WARN"
    return
  fi

  echo "OK"
}

# Classify RAM state based on available percent used (awk; no bc needed)
classify_ram() {
  local used_pct="$1"

  if float_gt "$used_pct" "$RAM_CRITICAL_PCT"; then
    echo "CRITICAL"
    return
  fi

  if float_gt "$used_pct" "$RAM_WARN_PCT"; then
    echo "WARN"
    return
  fi

  echo "OK"
}

# Classify CPU state based on load average (awk; no bc needed)
classify_cpu() {
  local load="$1"

  if float_gt "$load" "$CPU_WARN_LOAD"; then
    echo "WARN"
    return
  fi

  echo "OK"
}

# Format bytes to human-readable (awk; no bc needed)
format_bytes() {
  local bytes="$1"
  if [ "$bytes" -ge 1073741824 ]; then
    awk -v b="$bytes" 'BEGIN{printf "%.2f GB", b/1073741824}'
  elif [ "$bytes" -ge 1048576 ]; then
    awk -v b="$bytes" 'BEGIN{printf "%d MB", b/1048576}'
  else
    echo "${bytes} B"
  fi
}

# ---------- Disk Check ----------
# ENOSPC can strike on ANY fs in the download path (quota, overlay
# upperdir, /tmp tmpfs, inode exhaustion) even when APP_DIR looks
# large. Probe each path; classify on the conservative minimum.

probe_disk_path() {
  local target_path="$1"
  _PD_FREE_MB="0"; _PD_FREE_PCT="100"; _PD_TOTAL_MB="0"
  _PD_DEVICE="unknown"; _PD_MOUNT="unknown"
  _PD_INO_FREE="unknown"; _PD_INO_PCT="unknown"
  if [ ! -e "$target_path" ]; then
    target_path=$(dirname "$target_path")
  fi
  [ -e "$target_path" ] || return 1
  local df_line
  df_line=$(df -P "$target_path" 2>/dev/null | awk 'NR==2 {print $1,$2,$3,$4,$6}') || return 1
  [ -n "$df_line" ] || return 1
  local device total_kb free_kb mount
  device=$(echo "$df_line" | awk '{print $1}')
  total_kb=$(echo "$df_line" | awk '{print $2}')
  free_kb=$(echo "$df_line" | awk '{print $4}')
  mount=$(echo "$df_line" | awk '{print $5}')
  if [ -z "$total_kb" ] || [ "$total_kb" -le 0 ] 2>/dev/null; then return 1; fi
  _PD_DEVICE="$device"; _PD_MOUNT="$mount"
  # df -P reports 512-byte blocks on Linux/POSIX (NOT 1K): convert to MB.
  _PD_TOTAL_MB=$(( total_kb * 512 / 1048576 )); _PD_FREE_MB=$(( free_kb * 512 / 1048576 ))
  _PD_FREE_PCT=$(awk -v f="$free_kb" -v t="$total_kb" 'BEGIN{printf "%.1f", (t>0 ? f*100/t : 100)}')
  local ino_line
  ino_line=$(df -i -P "$target_path" 2>/dev/null | awk 'NR==2 {print $4,$5}') || true
  if [ -n "$ino_line" ]; then
    _PD_INO_FREE=$(echo "$ino_line" | awk '{print $1}')
    _PD_INO_PCT=$(echo "$ino_line" | awk '{print $2}')
  fi
  return 0
}

check_disk() {
  local target_path="${APP_DIR:-.}"
  local browsers_path="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
  local npm_cache_path=""
  if command -v npm >/dev/null 2>&1; then
    npm_cache_path=$(npm config get cache 2>/dev/null | tr -d '\r\n' || true)
  fi
  local tmp_path="${TMPDIR:-/tmp}"
  local home_path="${HOME:-$target_path}"
  local cands="$target_path
$browsers_path
$tmp_path
$home_path"
  if [ -n "$npm_cache_path" ]; then cands="$cands
$npm_cache_path"; fi
  if [ "$tmp_path" != "/tmp" ]; then cands="$cands
/tmp"; fi
  local min_free_mb="" min_free_pct="100" min_path="" min_dev="" min_mnt=""
  local sum_total_mb="0" sum_free_mb="0" sum_free_pct="100" probed=0
  local cand
  while IFS= read -r cand; do
    [ -z "$cand" ] && continue
    if probe_disk_path "$cand"; then
      probed=1
      log "Disk detail: path=${cand} device=${_PD_DEVICE} mount=${_PD_MOUNT} free=$((_PD_FREE_MB))MB/ $((_PD_TOTAL_MB))MB (${_PD_FREE_PCT}%) inodes_free=${_PD_INO_FREE} (${_PD_INO_PCT})"
      if [ "$cand" = "$target_path" ]; then
        sum_total_mb="$_PD_TOTAL_MB"; sum_free_mb="$_PD_FREE_MB"; sum_free_pct="$_PD_FREE_PCT"
      fi
      if [ -z "$min_free_mb" ] || [ "$_PD_FREE_MB" -lt "$min_free_mb" ]; then
        min_free_mb="$_PD_FREE_MB"; min_free_pct="$_PD_FREE_PCT"
        min_path="$cand"; min_dev="$_PD_DEVICE"; min_mnt="$_PD_MOUNT"
      fi
      if [ "$_PD_INO_FREE" = "0" ]; then
        min_free_mb="0"; min_free_pct="0"
        min_path="$cand (inodes exhausted)"; min_dev="$_PD_DEVICE"; min_mnt="$_PD_MOUNT"
      fi
    else
      log "Disk detail: path=${cand} (unavailable)"
    fi
  done <<CANDS_EOF
$cands
CANDS_EOF
  if [ "$probed" -eq 1 ] && [ -n "$min_free_mb" ]; then
    export ASHENAI_RESOURCE_DISK_FREE_MB="$min_free_mb"
    ASHENAI_RESOURCE_DISK_STATE=$(classify_disk "$min_free_mb" "$min_free_pct")
    export ASHENAI_RESOURCE_DISK_STATE
    local total_fmt free_fmt
    total_fmt=$(format_bytes "$((sum_total_mb * 1048576))")
    free_fmt=$(format_bytes "$((sum_free_mb * 1048576))")
    log "Disk: ${free_fmt} free / ${total_fmt} (${sum_free_pct}%) ${ASHENAI_RESOURCE_DISK_STATE} (container-visible; app path)"
    if [ "$min_path" != "$target_path" ]; then
      log "Disk: most constrained path: ${min_path} (${min_free_mb} MB free on ${min_dev} at ${min_mnt})"
    fi
    log "Disk note: df/statfs show container-visible capacity, NOT hosting account/server quota."
    log "Actual Wispbyte storage quota could not be verified from inside the container."
    return
  fi
  # Fallback single-path df (only reached if multi-path probe failed)
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
        # df -P reports 512-byte blocks (NOT 1K).
        total_mb=$(( total_kb * 512 / 1048576 ))
        free_mb=$(( free_kb * 512 / 1048576 ))
        used_pct=$(awk -v f="$free_kb" -v t="$total_kb" 'BEGIN{printf "%.1f", (t>0 ? (t-f)*100/t : 0)}')
        free_pct=$(awk -v f="$free_kb" -v t="$total_kb" 'BEGIN{printf "%.1f", (t>0 ? f*100/t : 100)}')

        export ASHENAI_RESOURCE_DISK_FREE_MB="$free_mb"
        ASHENAI_RESOURCE_DISK_STATE=$(classify_disk "$free_mb" "$free_pct")
        export ASHENAI_RESOURCE_DISK_STATE

        local total_fmt free_fmt
        total_fmt=$(format_bytes "$((total_kb * 512))")
        free_fmt=$(format_bytes "$((free_kb * 512))")

        log "Disk: ${free_fmt} free / ${total_fmt} (${free_pct}%) ${ASHENAI_RESOURCE_DISK_STATE} (container-visible; single-path fallback)"
        log "Disk note: df/statfs show container-visible capacity, NOT hosting account/server quota."
        log "Actual Wispbyte storage quota could not be verified from inside the container."
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

        log "Disk: ${free_fmt} free / ${total_fmt} (${free_pct}%) ${ASHENAI_RESOURCE_DISK_STATE} (container-visible; statfs fallback)"
        log "Disk note: df/statfs show container-visible capacity, NOT hosting account/server quota."
        log "Actual Wispbyte storage quota could not be verified from inside the container."
        return
      fi
    fi
  fi

  log "Disk: unavailable"
  log "Actual Wispbyte storage quota could not be verified from inside the container."
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
    used_pct=$(awk -v t="$total_mb" -v a="$available_mb" 'BEGIN{printf "%.1f", (t>0 ? (t-a)*100/t : 0)}')

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
