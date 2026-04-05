#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MONITOR_SCRIPT="$SCRIPT_DIR/monitor.sh"
CRON_JOB="0 * * * * $MONITOR_SCRIPT >> /var/log/rewards-monitor.log 2>&1"
CLEANUP_CRON="0 3 * * * docker exec microsoft-rewards-script /usr/src/microsoft-rewards-script/scripts/docker/cleanup.sh"

echo "=== Microsoft Rewards Script - 监控配置 ==="
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "请使用 sudo 运行此脚本"
    exit 1
fi

echo "1. 设置监控脚本权限..."
chmod +x "$MONITOR_SCRIPT"

echo "2. 创建日志目录..."
mkdir -p /var/log/rewards-monitor
touch /var/log/rewards-monitor.log
chmod 666 /var/log/rewards-monitor.log

echo "3. 配置宿主机 cron 任务..."

(crontab -l 2>/dev/null | grep -q "monitor.sh") && {
    echo "检测到已存在的 cron 任务，    crontab -l
    echo ""
    echo "如需更新，请手动删除旧任务后重新运行此脚本"
    exit 0
})

(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "4. 鷻加诊断清理任务..."
(crontab -l 2>/dev/null; echo "$CLEANUP_CRON") | crontab -

echo ""
echo "=== 配置完成 ==="
echo ""
echo "监控脚本: $MONITOR_SCRIPT"
echo "日志文件: /var/log/rewards-monitor.log"
echo ""
echo "Cron 任务:"
echo "  - 内存监控: 每小时检查一次，内存超过 80% 自动重启容器"
echo "  - 诊断清理: 每天凌晨 3 点清理 7 天前的诊断文件"
echo ""
echo "查看监控日志:"
echo "  tail -f /var/log/rewards-monitor.log"
echo ""
echo "查看当前 cron 任务:"
echo "  crontab -l"
