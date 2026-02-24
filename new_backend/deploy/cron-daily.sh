#!/usr/bin/env bash
# Call POST /api/v1/cron/daily with CRON_SECRET from .env. Run from repo root (e.g. via crontab).
# Usage: ./deploy/cron-daily.sh
# Logs to deploy/cron-daily.log (create dir if needed).

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$APP_DIR/deploy/cron-daily.log"

log() { echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"; }
log_err() { echo "[$(date -Iseconds)] ERROR: $*" >> "$LOG_FILE"; }

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  log_err ".env not found in $APP_DIR"
  exit 1
fi

CRON_SECRET=$(grep -E '^CRON_SECRET=' .env | sed 's/^CRON_SECRET=//' | tr -d '\r' | head -1)
if [[ -z "$CRON_SECRET" ]]; then
  log_err "CRON_SECRET not set in .env"
  exit 1
fi

log "Starting cron-daily"
# Call backend directly on localhost:3000 (no Caddy, no TLS)
if OUTPUT=$(curl -s -S -X POST -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:3000/api/v1/cron/daily" 2>&1); then
  log "OK: $OUTPUT"
else
  log_err "curl failed: $OUTPUT"
  exit 1
fi
