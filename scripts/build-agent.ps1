$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Force "$root/artifacts" | Out-Null
Push-Location "$root/services/agent"
try {
  go build -trimpath -ldflags='-s -w' -o "$root/artifacts/BakvionService.exe" ./cmd/bakvion
  if ($LASTEXITCODE -ne 0) { throw 'Agent build failed' }
} finally { Pop-Location }
