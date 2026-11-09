#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p artifacts
(cd services/agent && go build -trimpath -o ../../artifacts/bakvion ./cmd/bakvion)
pnpm typecheck
pnpm test
pnpm build
