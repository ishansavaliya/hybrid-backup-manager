$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Force "$root/artifacts" | Out-Null
Push-Location "$root/services/agent"
try {
  $version = (Get-Content "$root/package.json" -Raw | ConvertFrom-Json).version
  $ldflags = @('-s', '-w', "-X main.version=$version")
  if ($env:BAKVION_LICENSE_PUBLIC_KEY) { $ldflags += "-X github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/license.PublicKeyBase64=$($env:BAKVION_LICENSE_PUBLIC_KEY)" }
  if ($env:BAKVION_RELEASES_REPO) { $ldflags += "-X github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/update.ManifestURL=https://github.com/$($env:BAKVION_RELEASES_REPO)/releases/latest/download/latest.json" }
  if ($env:BAKVION_SERVER_URL) { $ldflags += "-X github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud.DefaultBaseURL=$($env:BAKVION_SERVER_URL)" }
  go build -trimpath -ldflags ($ldflags -join ' ') -o "$root/artifacts/BakvionService.exe" ./cmd/bakvion
  if ($LASTEXITCODE -ne 0) { throw 'Agent build failed' }
} finally { Pop-Location }
