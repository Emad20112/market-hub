param(
    [string]$DestinationRoot = (Join-Path $env:USERPROFILE "MarketHubBackups")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$StackDir = Join-Path $RepoRoot "deploy/supabase-stack"
$StackEnv = Join-Path $StackDir ".env"
$AppEnv = Join-Path $RepoRoot "deploy/.env.local-production"
$ComposeFile = Join-Path $StackDir "docker-compose.yml"
$OverrideFile = Join-Path $StackDir "docker-compose.local-production.override.yaml"
$StorageDir = Join-Path $StackDir "volumes/storage"

function Read-EnvValue([string]$Path, [string]$Name) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required private environment file is missing: $Path"
    }
    $prefix = "$Name="
    $matches = @(Get-Content -LiteralPath $Path | Where-Object { $_.StartsWith($prefix, [StringComparison]::Ordinal) })
    if ($matches.Count -ne 1) {
        throw "Expected exactly one $Name setting in $Path."
    }
    return $matches[0].Substring($prefix.Length).Trim()
}

foreach ($path in @($StackEnv, $AppEnv, $ComposeFile, $OverrideFile, $StorageDir)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Local production setup is incomplete: $path" }
}

if ((Read-EnvValue $AppEnv "SUPABASE_TARGET") -ne "docker" -or
    (Read-EnvValue $AppEnv "VITE_SUPABASE_TARGET") -ne "docker" -or
    (Read-EnvValue $AppEnv "SUPABASE_URL") -ne "http://api-gw:8000" -or
    (Read-EnvValue $AppEnv "VITE_SUPABASE_URL") -ne "http://localhost:8000") {
    throw "Refusing backup: deploy/.env.local-production is not configured for the isolated local Docker target."
}

$ComposeArgs = @(
    "--project-name", "supabase",
    "--env-file", $StackEnv,
    "-f", $ComposeFile,
    "-f", $OverrideFile
)
& docker compose @ComposeArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw "Local production Compose configuration is invalid." }

$publishedPort = @(& docker compose @ComposeArgs port db 5432)
if ($LASTEXITCODE -ne 0 -or $publishedPort.Count -ne 1 -or $publishedPort[0].Trim() -ne "127.0.0.1:5433") {
    throw "Refusing backup: expected the local production database to be published only at 127.0.0.1:5433."
}
& docker compose @ComposeArgs exec -T db pg_isready -U postgres -d postgres *> $null
if ($LASTEXITCODE -ne 0) { throw "Local production PostgreSQL is not healthy; no backup was created." }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $DestinationRoot $stamp
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$currentUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$icaclsPath = Join-Path $env:SystemRoot "System32/icacls.exe"
& $icaclsPath $backupDir /inheritance:r /grant:r "*$($currentUserSid):(OI)(CI)(F)" "*S-1-5-18:(OI)(CI)(F)" "*S-1-5-32-544:(OI)(CI)(F)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to the backup directory; no backup files were written." }

$dumpName = "database.dump"
$dumpInContainer = "/tmp/vortex-local-production-$stamp.dump"
$dumpPath = Join-Path $backupDir $dumpName

try {
    & docker compose @ComposeArgs exec -T db pg_dump -U postgres -d postgres -Fc -f $dumpInContainer
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL dump failed." }

    & docker compose @ComposeArgs exec -T db pg_restore --list $dumpInContainer *> $null
    if ($LASTEXITCODE -ne 0) { throw "The PostgreSQL dump failed its archive integrity check." }

    & docker compose @ComposeArgs cp "db:$dumpInContainer" $dumpPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $dumpPath -PathType Leaf)) {
        throw "Could not copy the database dump to the backup directory."
    }

    $storageBackup = Join-Path $backupDir "storage"
    & robocopy $StorageDir $storageBackup /E /COPY:DAT /R:2 /W:2 /XJ /NFL /NDL /NJH /NJS *> $null
    $robocopyExit = $LASTEXITCODE
    if ($robocopyExit -gt 7) { throw "Supabase Storage copy failed with robocopy exit code $robocopyExit." }

    $sourceFiles = @(Get-ChildItem -LiteralPath $StorageDir -File -Recurse -Force)
    $backupFiles = @(Get-ChildItem -LiteralPath $storageBackup -File -Recurse -Force)
    $sourceBytes = [long](($sourceFiles | Measure-Object -Property Length -Sum).Sum)
    $backupBytes = [long](($backupFiles | Measure-Object -Property Length -Sum).Sum)
    if ($null -eq ($sourceFiles | Measure-Object -Property Length -Sum).Sum) { $sourceBytes = 0 }
    if ($null -eq ($backupFiles | Measure-Object -Property Length -Sum).Sum) { $backupBytes = 0 }
    if ($sourceFiles.Count -ne $backupFiles.Count -or $sourceBytes -ne $backupBytes) {
        throw "Supabase Storage source and backup counts/sizes differ; treat this backup as incomplete."
    }

    Copy-Item -LiteralPath $StackEnv -Destination (Join-Path $backupDir "supabase-stack.env")
    Copy-Item -LiteralPath $AppEnv -Destination (Join-Path $backupDir "app.env")

    $manifest = [ordered]@{
        created_at = (Get-Date).ToString("o")
        target = "local-production-docker"
        database_file = $dumpName
        database_sha256 = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash
        storage_directory = "storage"
        storage_file_count = $backupFiles.Count
        storage_total_bytes = $backupBytes
        includes_private_environment_files = $true
        restore_note = "This bundle belongs only to this installation. Protect it as confidential and keep a separate copy off this PC."
    }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupDir "manifest.json") -Encoding utf8

    # docker compose cp may create files without inheriting the destination
    # directory ACL. Apply explicit ACEs per path; file ACEs use (F), while
    # directory ACEs propagate to children created by robocopy.
    $aclTargets = @($backupDir) + @(Get-ChildItem -LiteralPath $backupDir -Force -Recurse | ForEach-Object { $_.FullName })
    foreach ($target in $aclTargets) {
        $item = Get-Item -LiteralPath $target -Force
        $rights = if ($item.PSIsContainer) { "(OI)(CI)(F)" } else { "(F)" }
        & $icaclsPath $target /inheritance:r /grant:r "*$($currentUserSid):$rights" "*S-1-5-18:$rights" "*S-1-5-32-544:$rights" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to backup path: $target" }
    }
    $verifiedHash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash
    if ($verifiedHash -ne $manifest.database_sha256) { throw "Database dump hash changed after permissions were applied." }

    Write-Host "Local production backup created and checked: $backupDir" -ForegroundColor Green
    Write-Host "Database SHA-256: $($manifest.database_sha256)"
    Write-Host "Storage files: $($manifest.storage_file_count); bytes: $($manifest.storage_total_bytes)"
    Write-Host "Copy the entire folder to a separate drive/USB. It contains installation secrets."
}
finally {
    & docker compose @ComposeArgs exec -T db rm -f $dumpInContainer *> $null
}
