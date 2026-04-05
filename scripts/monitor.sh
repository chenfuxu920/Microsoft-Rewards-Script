#!/bin/bash

CONTAINER_NAME="microsoft-rewards-script"
MEMORY_THRESHOLD=80
LOG_FILE="/var/log/rewards-monitor.log"

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_message "容器 $CONTAINER_NAME 未运行"
    exit 1
fi

MEM_USAGE=$(docker stats --no-stream --format "{{.MemPerc}}" "$CONTAINER_NAME" 2>/dev/null | tr -d '%')

if [ -z "$MEM_USAGE" ]; then
    log_message "无法获取容器内存使用率"
    exit 1
fi

MEM_USAGE_INT=${MEM_USAGE%.*}

if [ "$MEM_USAGE_INT" -gt "$MEMORY_THRESHOLD" ]; then
    log_message "内存使用率 ${MEM_USAGE}% 超过阈值 ${MEMORY_THRESHOLD}%，正在重启容器..."
    
    docker restart "$CONTAINER_NAME" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log_message "容器重启成功"
    else
        log_message "容器重启失败"
        exit 1
    fi
else
    log_message "内存使用率 ${MEM_USAGE}% 正常"
fi

exit 0
