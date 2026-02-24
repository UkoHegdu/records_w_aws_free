#!/usr/bin/env bash
# Run on Hetzner server from repo root. Expects .env in same directory.
# Usage: ./deploy/deploy.sh

set -e
cd "$(dirname "$0")/.."

chmod +x deploy/cron-daily.sh

echo "Building and starting containers..."
docker compose -f compose.prod.yaml up -d --build

echo "Restarting reverse-proxy (re-resolve upstream IPs)..."
docker compose -f compose.prod.yaml restart reverse-proxy

echo "Done. App: http://$(hostname -I | awk '{print $1}')/"
docker compose -f compose.prod.yaml ps
