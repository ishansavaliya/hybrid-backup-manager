#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p artifacts
version=$(node -p "require('./package.json').version")
ldflags="-X main.version=$version"
if [ -n "${BAKVION_LICENSE_PUBLIC_KEY:-}" ]; then ldflags="$ldflags -X github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/license.PublicKeyBase64=$BAKVION_LICENSE_PUBLIC_KEY"; fi
if [ -n "${BAKVION_SERVER_URL:-}" ]; then ldflags="$ldflags -X github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud.DefaultBaseURL=$BAKVION_SERVER_URL"; fi
(cd services/agent && go build -trimpath -ldflags "$ldflags" -o ../../artifacts/bakvion ./cmd/bakvion)
pnpm typecheck
pnpm test
pnpm build
