#!/bin/bash
set -euo pipefail

for _ in $(seq 60); do
  if curl -fsS http://localhost:3000/api/health >/dev/null; then
    exit 0
  fi
  sleep 1
done

echo "API did not become healthy in 60s" >&2
docker logs --tail 50 poc-bank-api >&2 || true
exit 1
