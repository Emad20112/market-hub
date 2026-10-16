# Build "HEAD routeTree + general-ledger only" deterministically.
$in  = 'tmp_head_routetree.ts'
$out = 'tmp_gl_only_routetree.ts'

$lines = [System.Collections.Generic.List[string]](Get-Content $in)
$ops = New-Object System.Collections.Generic.List[object]

function Add-Op([string]$anchor, [string[]]$adds) {
  $ops.Add([pscustomobject]@{ Anchor = $anchor; Adds = $adds })
}

# 1) import line after finance import
Add-Op "import { Route as AppFinanceRouteImport } from './routes/_app.finance'" @(
  "import { Route as AppGeneralLedgerRouteImport } from './routes/_app.general-ledger'"
)

# 2) route const definition. HEAD has AppFinanceRoute update block ending with "} as any)" then "const AppNotificationsRoute..."
# Insert the whole GL route const block between them.
Add-Op "const AppNotificationsRoute = AppNotificationsRouteImport.update({" @(
  "const AppGeneralLedgerRoute = AppGeneralLedgerRouteImport.update({",
  "  id: '/general-ledger',",
  "  path: '/general-ledger',",
  "  getParentRoute: () => AppRoute,",
  "} as any)"
)

# 3) FileRoutesByFullPath interface entry. Anchor: "  '/finance': typeof AppFinanceRoute"
Add-Op "  '/finance': typeof AppFinanceRoute" @(
  "  '/general-ledger': typeof AppGeneralLedgerRoute"
)

# 4) FileRoutesByTo entry. Same anchor text appears again -> handle by index pass.
# 5) FileRoutesById entry anchor "  '/_app/finance': typeof AppFinanceRoute"
Add-Op "  '/_app/finance': typeof AppFinanceRoute" @(
  "  '/_app/general-ledger': typeof AppGeneralLedgerRoute"
)

# 6) FileRouteTypes fullPaths union anchor "    | '/finance'"
Add-Op "    | '/finance'" @(
  "    | '/general-ledger'"
)

# 7) FileRouteTypes to union anchor "    | '/_app/finance'"
Add-Op "    | '/_app/finance'" @(
  "    | '/_app/general-ledger'"
)

# 8) declare module update block anchor "      preLoaderRoute: typeof AppFinanceRouteImport"
Add-Op "      preLoaderRoute: typeof AppFinanceRouteImport" @(
  "      preLoaderRoute: typeof AppGeneralLedgerRouteImport"
)

# 9) route object: "    '/_app/finance': {"
Add-Op "    '/_app/finance': {" @(
  "    '/_app/general-ledger': {",
  "      id: '/_app/general-ledger',",
  "      path: '/general-ledger',",
  "      fullPath: '/general-ledger',",
  "      preLoaderRoute: typeof AppGeneralLedgerRouteImport,",
  "      parentRoute: typeof AppRoute",
  "    }"
)

# 10) AppRouteChildren interface: "  AppFinanceRoute: typeof AppFinanceRoute"
Add-Op "  AppFinanceRoute: typeof AppFinanceRoute" @(
  "  AppGeneralLedgerRoute: typeof AppGeneralLedgerRoute"
)

# 11) AppRouteChildren object: "  AppFinanceRoute: AppFinanceRoute,"
Add-Op "  AppFinanceRoute: AppFinanceRoute," @(
  "  AppGeneralLedgerRoute: AppGeneralLedgerRoute,"
)

$used = New-Object 'bool[]' $ops.Count

for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  for ($k = 0; $k -lt $ops.Count; $k++) {
    if ($used[$k]) { continue }
    if ($line.TrimEnd() -eq $ops[$k].Anchor.TrimEnd()) {
      # insert adds AFTER this line
      $insertAt = $i + 1
      for ($j = $ops[$k].Adds.Count - 1; $j -ge 0; $j--) {
        $lines.Insert($insertAt, $ops[$k].Adds[$j])
      }
      $used[$k] = $true
      Write-Host "Applied op $k at line $($i+1): $($ops[$k].Anchor)"
    }
  }
}

for ($k = 0; $k -lt $ops.Count; $k++) {
  if (-not $used[$k]) { Write-Host "WARNING: op $k NOT applied: $($ops[$k].Anchor)" }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$outPath = Join-Path (Get-Location).Path $out
[System.IO.File]::WriteAllLines($outPath, $lines, $utf8NoBom)
Write-Host "Written $out with $($lines.Count) lines"
