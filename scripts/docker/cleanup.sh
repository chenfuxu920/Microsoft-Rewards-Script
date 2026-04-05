#!/bin/bash

DIAGNOSTICS_DIR="/usr/src/microsoft-rewards-script/diagnostics"
MAX_DAYS=7

if [ -d "$DIAGNOSTICS_DIR" ]; then
    find "$DIAGNOSTICS_DIR" -type d -name "error-*" -mtime +$MAX_DAYS -exec rm -rf {} + 2>/dev/null
fi

exit 0
