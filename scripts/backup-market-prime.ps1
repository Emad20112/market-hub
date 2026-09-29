# Backup market-prime (schema + data) using the Supabase CLI.
# Runs detached so it can exceed the interactive timeout.
# Usage: powershell -File scripts/backup-market-prime.ps1

$ErrorActionPreference = "Continue"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" +
            "C:\Program Files\Docker\Docker\resources\bin"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dir = Join-Path $root "backups\market-prime-$stamp"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$log = Join-Path $dir "backup.log"
function Log($m) { $m | Tee-Object -FilePath $log -Append }

Log "=== BACKUP START $stamp ==="
Log "DIR=$dir"

# 1) Roles
Log "--- 1/3 roles.sql ---"
npx supabase db dump --linked -f "$dir/roles.sql" --role-only *>&1 |
  ForEach-Object { Log $_ }
Log "roles exit=$LASTEXITCODE"

# 2) Schema (public + auth definitions, no data)
Log "--- 2/3 schema.sql ---"
npx supabase db dump --linked -f "$dir/schema.sql" *>&1 |
  ForEach-Object { Log $_ }
Log "schema exit=$LASTEXITCODE"

# 3) Data
Log "--- 3/3 data.sql ---"
npx supabase db dump --linked -f "$dir/data.sql" --data-only --use-copy *>&1 |
  ForEach-Object { Log $_ }
Log "data exit=$LASTEXITCODE"

Log "--- FILES ---"
Get-ChildItem $dir | ForEach-Object { Log ("{0}`t{1} bytes" -f $_.Name, $_.Length) }
Log "=== BACKUP DONE ==="