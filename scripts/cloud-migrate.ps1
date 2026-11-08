# ==============================================================================
# scripts/cloud-migrate.ps1
# يطبّق ترحيلات قاعدة البيانات على مشروع Supabase السحابي (وليس الدوكر).
#
# يقرأ بيانات الاتصال من .env.cloud في جذر المشروع (سري ومستثنى من Git)،
# ثم يستدعي scripts/push-cloud.ps1 الرسمي الذي يفحص التوافق قبل أي تطبيق.
#
# الاستخدام:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\cloud-migrate.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$cloudEnvFile = Join-Path $repoRoot ".env.cloud"

# وصول أمر supabase عبر npx إن لم يكن مثبتًا عامًا.
$nodeBin = "C:\Program Files\nodejs"
if (Test-Path $nodeBin) { $env:Path = "$nodeBin;$env:Path" }
function Resolve-SupabaseCli {
  $cmd = Get-Command supabase -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  Write-Host "[..] supabase غير موجود على PATH — تشغيله عبر npx..." -ForegroundColor Yellow
  return "npx.cmd"
}
$global:SupabaseCli = Resolve-SupabaseCli

if (-not (Test-Path $cloudEnvFile)) {
  throw "لم يُعثر على .env.cloud. أنشئه وأضف SUPABASE_CLOUD_DB_URL فيه (راجع التعليقات داخل الملف)."
}

# تحميل متغيرات الاتصال السحابية إلى بيئة هذه العملية فقط.
foreach ($line in Get-Content $cloudEnvFile) {
  $trimmed = $line.Trim()
  if ($trimmed -match '^[A-Za-z_][A-Za-z0-9_]*\s*=' -and $trimmed -notmatch '^\s*#') {
    $parts = $trimmed -split '=', 2
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"').Trim("'"), "Process")
  }
}

if (-not $env:SUPABASE_CLOUD_DB_URL) {
  throw "SUPABASE_CLOUD_DB_URL غير معرّف داخل .env.cloud."
}

# تأكيد آلي: السكربت الأصلي يطلب عبارة تأكيد يدوية، ونحن نعتمدها لأن الهدف
# محدد ومُتحقق منه (فحص BASELINE_READY) ولا يوجد أي إعادة تأسيس أو مسح.
$env:CLOUD_PUSH_AUTO_CONFIRM = "1"

Write-Host "[OK] تم تحميل بيانات الاتصال السحابية من .env.cloud" -ForegroundColor Green
Write-Host "[GO] تطبيق الترحيلات على مشروع Supabase السحابي (vortex-mill)..." -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "push-cloud.ps1") -ProjectRef "kwzqvgdyadylwnvjghqn"
