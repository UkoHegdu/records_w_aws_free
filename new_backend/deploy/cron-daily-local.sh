#!/usr/bin/env bash
# Trigger daily scheduler (local: backend on port 3000). Run from repo root.
# Usage: ./deploy/cron-daily-local.sh

set -e
cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "cron-daily-local: .env not found" >&2; exit 1; }

CRON_SECRET=$(grep -E '^CRON_SECRET=' .env | sed 's/^CRON_SECRET=//' | tr -d '\r' | head -1)
[[ -n "$CRON_SECRET" ]] || { echo "cron-daily-local: CRON_SECRET not set in .env" >&2; exit 1; }

curl -s -S -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/v1/cron/daily"
