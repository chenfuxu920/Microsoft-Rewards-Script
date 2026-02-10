#!/bin/sh
set -e

# 1. Timezone: default to UTC if not provided
: "${TZ:=UTC}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

# 2. 验证 CRON_SCHEDULE
if [ -z "${CRON_SCHEDULE:-}" ]; then
  echo "错误: 未设置 CRON_SCHEDULE 环境变量。" >&2
  echo "请设置 CRON_SCHEDULE (例如，\"0 2 * * *\")." >&2
  exit 1
fi

# 3. 如果 RUN_ON_START=true，则在无延迟的情况下进行初始运行
if [ "${RUN_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] 在 $(date) 开始后台初始运行"
  (
    cd /usr/src/microsoft-rewards-script || {
      echo "[entrypoint-bg] 错误: 无法切换到 /usr/src/microsoft-rewards-script 目录" >&2
      exit 1
    }
    # 跳过初始运行的随机延迟，但保留 cron 作业的设置
    SKIP_RANDOM_SLEEP=true scripts/docker/run_daily.sh
    echo "[entrypoint-bg] 初始运行在 $(date) 完成"
  ) &
  echo "[entrypoint] 后台进程已启动 (PID: $!)"
fi

# 设置 cron 任务
if [ -f "/etc/cron.d/microsoft-rewards-cron.template" ]; then
    # 替换模板中的占位符
    CRON_SCHEDULE_ESCAPED=$(echo "$CRON_SCHEDULE" | sed 's/\*/\\*/g')
    echo "DEBUG: CRON_SCHEDULE_ESCAPED=$CRON_SCHEDULE_ESCAPED"
    echo "DEBUG: TZ=$TZ"
    echo "DEBUG: Before sed - template content:"
    cat /etc/cron.d/microsoft-rewards-cron.template
    sed -i "s|\${CRON_SCHEDULE}|$CRON_SCHEDULE_ESCAPED|g" /etc/cron.d/microsoft-rewards-cron.template || true
    sed -i "s|\${TZ}|$TZ|g" /etc/cron.d/microsoft-rewards-cron.template || true
    echo "DEBUG: After sed - template content:"
    cat /etc/cron.d/microsoft-rewards-cron.template

    # 启用 cron 任务
    cp /etc/cron.d/microsoft-rewards-cron.template /etc/cron.d/microsoft-rewards-cron
    chmod 0644 /etc/cron.d/microsoft-rewards-cron

    # 启动 cron 服务
    echo "正在启动 cron 服务..."
    service cron start

    # 检查 cron 服务状态
    if service cron status; then
        echo "Cron 服务启动成功"
    else
        echo "警告: Cron 服务启动失败"
    fi
else
    echo "警告: 在 /etc/cron.d/microsoft-rewards-cron.template 找不到 Cron 模板"
fi

# 启动应用
echo "正在启动 Microsoft Rewards 脚本..."
exec "$@"
