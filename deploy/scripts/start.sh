#!/bin/bash
set -euo pipefail

DEPLOY_DIR=/opt/poc-bank/deploy
CONFIG_DIR=/etc/poc-bank
IMAGE="nicollasprado/poc-bank-system:$(cat "$DEPLOY_DIR/image-tag")"

run_args=(--env-file "$CONFIG_DIR/app.env")
if [ -f "$CONFIG_DIR/global-bundle.pem" ]; then
  run_args+=(-v "$CONFIG_DIR/global-bundle.pem:/app/global-bundle.pem:ro")
fi

docker pull "$IMAGE"

docker run --rm "${run_args[@]}" "$IMAGE" \
  node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js

docker rm -f poc-bank-api poc-bank-worker 2>/dev/null || true

docker run -d --name poc-bank-api --restart unless-stopped \
  "${run_args[@]}" -p 3000:3000 "$IMAGE"

docker run -d --name poc-bank-worker --restart unless-stopped \
  "${run_args[@]}" "$IMAGE" node dist/main.worker
