#!/usr/bin/env bash
set -euo pipefail

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
else
  NODE_MAJOR="0"
fi

if [ "${NODE_MAJOR}" -ge 22 ]; then
  npm "$@"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Node 22+ or Docker is required to run npm tasks." >&2
  exit 1
fi

docker run --rm \
  -v "$(pwd)":/app \
  -w /app \
  node:22 \
  npm "$@"
