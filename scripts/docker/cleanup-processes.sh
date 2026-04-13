#!/usr/bin/env bash
# 增强的进程清理脚本
# 用于在脚本异常时强制清理残留进程

set -euo pipefail

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [cleanup-processes] $1"
}

log "开始清理残留进程..."

# 1. 优雅关闭浏览器进程（给进程时间保存数据）
log "优雅关闭浏览器进程..."
pkill -TERM -f 'chrome-headless-shell' 2>/dev/null || true
sleep 3

# 2. 强制终止未响应的浏览器进程
log "强制终止残留浏览器进程..."
pkill -9 -f 'chrome-headless-shell' 2>/dev/null || true
sleep 2

# 3. 清理残留的 Node.js 工作进程
log "清理残留的Node.js工作进程..."
pkill -9 -f 'node.*dist/index.js' 2>/dev/null || true
sleep 1

# 4. 清理临时文件
log "清理临时文件..."
rm -rf /tmp/playwright_chromiumdev_profile-* 2>/dev/null || true
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true

# 5. 验证清理效果
remaining_chrome=$(pgrep -f 'chrome-headless-shell' | wc -l || echo "0")
remaining_node=$(pgrep -f 'node.*dist/index.js' | wc -l || echo "0")

log "清理完成: Chrome进程=${remaining_chrome}, Node进程=${remaining_node}"

# 6. 如果还有残留进程，显示详细信息
if [ "$remaining_chrome" -gt 0 ] || [ "$remaining_node" -gt 0 ]; then
    log "警告: 仍有残留进程"
    if [ "$remaining_chrome" -gt 0 ]; then
        log "Chrome进程列表:"
        ps aux | grep 'chrome-headless-shell' | grep -v grep || true
    fi
    if [ "$remaining_node" -gt 0 ]; then
        log "Node进程列表:"
        ps aux | grep 'node.*dist/index.js' | grep -v grep || true
    fi
fi

exit 0
