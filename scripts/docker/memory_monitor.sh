#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/usr/src/microsoft-rewards-script/logs/memory-monitor.log"
MAX_MEMORY_PERCENT=${MAX_MEMORY_PERCENT:-85}
CHECK_INTERVAL=${CHECK_INTERVAL:-300}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

get_memory_percent() {
    local mem_info
    mem_info=$(free | grep Mem)
    local used=$(echo "$mem_info" | awk '{print $3}')
    local total=$(echo "$mem_info" | awk '{print $2}')
    echo $((used * 100 / total))
}

log "内存监控启动 | 最大内存阈值: ${MAX_MEMORY_PERCENT}% | 检查间隔: ${CHECK_INTERVAL}秒"

while true; do
    MEM_PERCENT=$(get_memory_percent)
    
    if [ "$MEM_PERCENT" -gt "$MAX_MEMORY_PERCENT" ]; then
        log "警告: 内存使用率 ${MEM_PERCENT}% 超过阈值 ${MAX_MEMORY_PERCENT}%"
        log "正在清理缓存..."
        
        sync
        echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || log "无法清理系统缓存（需要root权限）"
        
        sleep 10
        NEW_MEM_PERCENT=$(get_memory_percent)
        log "清理后内存使用率: ${NEW_MEM_PERCENT}%"
        
        if [ "$NEW_MEM_PERCENT" -gt "$MAX_MEMORY_PERCENT" ]; then
            log "内存使用率仍然过高，建议重启容器"
        fi
    else
        log "内存使用率正常: ${MEM_PERCENT}%"
    fi
    
    sleep "$CHECK_INTERVAL"
done
