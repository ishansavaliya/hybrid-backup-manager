# Run elevated. Preserves repositories, passwords and state.
$ErrorActionPreference = 'Stop'
Stop-Service BakvionService -ErrorAction Stop
& sc.exe delete BakvionService
if ($LASTEXITCODE -ne 0) { throw 'Service removal failed' }
