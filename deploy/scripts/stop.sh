#!/bin/bash
set -euo pipefail

docker rm -f poc-bank-api poc-bank-worker 2>/dev/null || true
