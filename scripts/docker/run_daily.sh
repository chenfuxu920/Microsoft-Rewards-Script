#!/usr/bin/env bash
set -euo pipefail

export TZ="${TZ:-UTC}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/usr/src/microsoft-rewards-script/pw-browsers}"
export PATCHRIGHT_BROWSERS_PATH="${PATCHRIGHT_BROWSERS_PATH:-/usr/src/microsoft-rewards-script/pw-browsers}"

cd /usr/src/microsoft-rewards-script

# Ensure log directory exists
LOG_DIR="/usr/src/microsoft-rewards-script/logs"
mkdir -p "$LOG_DIR"

# Define log file with date
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/run-${TODAY}.log"

# Clean up logs older than 3 days
find "$LOG_DIR" -name "run-*.log" -type f -mtime +2 -delete

# Redirect output based on execution environment
if [ -t 1 ]; then
    # Interactive session: Log to file and stdout (user sees it)
    exec > >(tee -a "$LOG_FILE") 2>&1
else
    # Non-interactive (Cron/Background): Log to file and Docker logs (PID 1 stdout)
    exec > >(tee -a "$LOG_FILE" > /proc/1/fd/1) 2> >(tee -a "$LOG_FILE" > /proc/1/fd/2)
fi

LOCKFILE=/tmp/run_daily.lock

# -------------------------------
#  函数: 检查并修复锁文件完整性
# -------------------------------
self_heal_lockfile() {
    # 如果锁文件存在但为空  删除它
    if [ -f "$LOCKFILE" ]; then
        local lock_content
        lock_content=$(<"$LOCKFILE" || echo "")

        if [[ -z "$lock_content" ]]; then
            echo "[$(date)] [run_daily.sh] 发现空锁文件  正在删除。"
            rm -f "$LOCKFILE"
            return
        fi

        # 如果锁文件包含非数字PID  删除它
        if ! [[ "$lock_content" =~ ^[0-9]+$ ]]; then
            echo "[$(date)] [run_daily.sh] 发现损坏的锁文件内容 ('$lock_content')  正在删除。"
            rm -f "$LOCKFILE"
            return
        fi

        # 如果锁文件包含PID但进程已死  删除它
        if ! kill -0 "$lock_content" 2>/dev/null; then
            echo "[$(date)] [run_daily.sh] 锁文件PID $lock_content 已死亡  正在删除陈旧锁。"
            rm -f "$LOCKFILE"
            return
        fi
    fi
}

# -------------------------------
#  函数: 获取锁
# -------------------------------
acquire_lock() {
    local max_attempts=5
    local attempt=0
    local timeout_hours=${STUCK_PROCESS_TIMEOUT_HOURS:-8}
    local timeout_seconds=$((timeout_hours * 3600))

    while [ $attempt -lt $max_attempts ]; do
        # 尝试使用当前PID创建锁
        if (set -C; echo "$$" > "$LOCKFILE") 2>/dev/null; then
            echo "[$(date)] [run_daily.sh] 锁获取成功 (PID: $$)"
            return 0
        fi

        # 锁存在，验证它
        if [ -f "$LOCKFILE" ]; then
            local existing_pid
            existing_pid=$(<"$LOCKFILE" || echo "")

            echo "[$(date)] [run_daily.sh] 锁文件存在，PID: '$existing_pid'"

            # 如果锁文件内容无效  删除并重试
            if [[ -z "$existing_pid" || ! "$existing_pid" =~ ^[0-9]+$ ]]; then
                echo "[$(date)] [run_daily.sh] 删除无效锁文件  重试..."
                rm -f "$LOCKFILE"
                continue
            fi

            # 如果进程已死  删除并重试
            if ! kill -0 "$existing_pid" 2>/dev/null; then
                echo "[$(date)] [run_daily.sh] 删除陈旧锁 (死PID: $existing_pid)"
                rm -f "$LOCKFILE"
                continue
            fi

            # 检查进程运行时间  如果超过超时则终止
            local process_age
            if process_age=$(ps -o etimes= -p "$existing_pid" 2>/dev/null | tr -d ' '); then
                if [ "$process_age" -gt "$timeout_seconds" ]; then
                    echo "[$(date)] [run_daily.sh] 终止卡住的进程 $existing_pid (${process_age}s > ${timeout_hours}h)"
                    kill -TERM "$existing_pid" 2>/dev/null || true
                    sleep 5
                    kill -KILL "$existing_pid" 2>/dev/null || true
                    rm -f "$LOCKFILE"
                    continue
                fi
            fi
        fi

        echo "[$(date)] [run_daily.sh] 锁被PID $existing_pid 持有，尝试 $((attempt + 1))/$max_attempts"
        sleep 2
        ((attempt++))
    done

    echo "[$(date)] [run_daily.sh] 尝试 $max_attempts 次后仍无法获取锁；退出。"
    return 1
}

# -------------------------------
#  函数: 释放锁
# -------------------------------
release_lock() {
    if [ -f "$LOCKFILE" ]; then
        local lock_pid
        lock_pid=$(<"$LOCKFILE")
        if [ "$lock_pid" = "$$" ]; then
            rm -f "$LOCKFILE"
            echo "[$(date)] [run_daily.sh] 锁已释放 (PID: $$)"
        fi
    fi
}

# 退出时始终释放锁  但仅在我们获得锁时
trap 'release_lock' EXIT INT TERM

# -------------------------------
#  主执行流程
# -------------------------------
echo "[$(date)] [run_daily.sh] 当前进程PID: $$"

# 清理上次可能残留的进程
echo "[$(date)] [run_daily.sh] 清理上次残留进程..."
pkill -9 -f 'chrome-headless-shell' 2>/dev/null || true
sleep 1

# 在继续之前自愈任何损坏或空锁
self_heal_lockfile

# 尝试安全获取锁
if ! acquire_lock; then
    exit 0
fi

# 在MIN和MAX之间随机休眠以分散执行
MINWAIT=${MIN_SLEEP_MINUTES:-5}
MAXWAIT=${MAX_SLEEP_MINUTES:-50}
MINWAIT_SEC=$((MINWAIT*60))
MAXWAIT_SEC=$((MAXWAIT*60))

if [ "${SKIP_RANDOM_SLEEP:-false}" != "true" ]; then
    SLEEPTIME=$(( MINWAIT_SEC + RANDOM % (MAXWAIT_SEC - MINWAIT_SEC) ))
    echo "[$(date)] [run_daily.sh] 休眠 $((SLEEPTIME/60)) 分钟 ($SLEEPTIME 秒)"
    sleep "$SLEEPTIME"
else
    echo "[$(date)] [run_daily.sh] 跳过随机休眠"
fi

# -------------------------------
#  循环执行逻辑
# -------------------------------
while true; do
    # 1. 清除诊断信息
    echo "[$(date)] [run_daily.sh] 清除诊断信息..."
    rm -rf ./diagnostics/*
    
    # 2. 启动实际脚本（添加超时保护）
    echo "[$(date)] [run_daily.sh] 开始脚本..."
    
    # 设置脚本超时时间（小时转换为秒）
    SCRIPT_TIMEOUT_HOURS=${SCRIPT_TIMEOUT_HOURS:-8}
    SCRIPT_TIMEOUT_SECONDS=$((SCRIPT_TIMEOUT_HOURS * 3600))
    
    # 使用timeout命令运行脚本，超时后自动终止
    if timeout --signal=SIGTERM --kill-after=60 ${SCRIPT_TIMEOUT_SECONDS} npm start; then
        echo "[$(date)] [run_daily.sh] 脚本运行完成。"
    else
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 124 ]; then
            echo "[$(date)] [run_daily.sh] 警告: 脚本运行超时 (${SCRIPT_TIMEOUT_HOURS}小时)，已强制终止。"
        else
            echo "[$(date)] [run_daily.sh] 警告: 脚本运行过程中出现错误 (退出码: ${EXIT_CODE})。"
        fi
    fi
    
    # 3. 强制清理残留进程
    echo "[$(date)] [run_daily.sh] 清理残留的浏览器和Node进程..."
    if [ -f "/usr/src/microsoft-rewards-script/scripts/docker/cleanup-processes.sh" ]; then
        /usr/src/microsoft-rewards-script/scripts/docker/cleanup-processes.sh
    else
        pkill -9 -f 'chrome-headless-shell' 2>/dev/null || true
        pkill -9 -f 'node.*dist/index.js' 2>/dev/null || true
    fi
    sleep 3

    # 4. 检查诊断目录是否存在错误日志
    if [ "$(ls -A ./diagnostics 2>/dev/null)" ]; then
        echo "[$(date)] [run_daily.sh] 检测到 diagnostics 中存在错误日志，将在 1 小时后重新启动脚本..."
        sleep 3600
        echo "[$(date)] [run_daily.sh] 正在重新启动脚本..."
        continue
    else
        echo "[$(date)] [run_daily.sh] 未检测到错误诊断日志，运行结束。"
        break
    fi
done

echo "[$(date)] [run_daily.sh] 脚本完成"
# 锁通过trap自动释放