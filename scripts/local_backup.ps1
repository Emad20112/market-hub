param(
    [string]$DestinationRoot = (Join-Path $env:USERPROFILE "MarketHubBackups")
)

$ErrorActionPreference = "Stop"
$BackupScript = Join-Path $PSScriptRoot "backup-local-production.ps1"
if (-not (Test-Path -LiteralPath $BackupScript -PathType Leaf)) {
    throw "Local production backup script is missing: $BackupScript"
}

& $BackupScript -DestinationRoot $DestinationRoot
