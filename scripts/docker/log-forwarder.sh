#!/bin/bash
# Log forwarder: Monitor log file and output to stdout for Docker logs
# This allows cron job logs to appear in docker logs

# Support single LOG_FILE or multiple via space-separated list
# Default to both main log and cron log
# No longer using PID file to avoid issues with PID recycling in Docker
# and persistent volumes. The entrypoint script handles starting this once.
LOG_FILES="${LOG_FILE:-/var/log/microsoft-rewards.log /var/log/cron.log}"

# Ensure log files exist
for f in $LOG_FILES; do
    touch "$f"
done

echo "[$(date '+%a %b %d %H:%M:%S %Z %Y')] [log-forwarder] Log forwarder started | watching: $LOG_FILES"

# Monitor log files for new content and stream to stdout
# Use tail -F to handle file rotation/recreation
# -q to suppress headers when watching multiple files (cleaner docker logs)
exec tail -n 0 -F -q $LOG_FILES
