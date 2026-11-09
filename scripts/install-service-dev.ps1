# DEVELOPMENT installer: explicit account and filesystem provisioning required.
# Run elevated. Does not copy binaries, provision secrets, or claim installer readiness.
param(
 [Parameter(Mandatory=$true)][string]$Executable,
 [Parameter(Mandatory=$true)][string]$Restic,
 [Parameter(Mandatory=$true)][string]$StateDirectory,
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][PSCredential]$ServiceCredential
)
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator authorization required' }
if ($OwnerSid -notmatch '^S-1-5-21-(\d+-){2}\d+-\d+$') { throw 'Expected an explicit local/domain user SID' }
foreach ($path in @($Executable,$Restic,$StateDirectory)) { if ($path.Contains('"')) { throw 'Invalid quoted path' } }
$Executable = (Resolve-Path $Executable).Path
$Restic = (Resolve-Path $Restic).Path
New-Item -ItemType Directory -Force $StateDirectory | Out-Null
$StateDirectory = (Resolve-Path $StateDirectory).Path
$account = $ServiceCredential.UserName
# Service account must already have Log on as a service and explicit read/write access.
& icacls.exe $StateDirectory /inheritance:r /grant:r "${account}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F'
if ($LASTEXITCODE -ne 0) { throw 'Cannot secure agent state' }
$binPath = '"' + $Executable + '" --state "' + (Join-Path $StateDirectory 'agent.db') + '" --restic "' + $Restic + '" --owner-sid ' + $OwnerSid + ' service'
New-Service -Name BakvionService -DisplayName 'Bakvion Background Backup' -BinaryPathName $binPath -StartupType Automatic -Credential $ServiceCredential | Out-Null
& sc.exe failure BakvionService reset= 86400 actions= restart/10000/restart/30000/restart/60000
if ($LASTEXITCODE -ne 0) { throw 'Recovery configuration failed' }
& sc.exe sdset BakvionService 'D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLORC;;;AU)'
if ($LASTEXITCODE -ne 0) { throw 'Service ACL configuration failed' }
Write-Host 'Service registered. Verify source/repository/secret ACLs and use Start-Service BakvionService.'
