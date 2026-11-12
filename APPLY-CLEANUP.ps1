param([string]$RepoPath = ".")
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path $RepoPath).Path
if (-not (Test-Path (Join-Path $repo '.git'))) { throw "RepoPath must point to a locally cloned Git repository with .git" }
foreach ($required in @('app/admin/page.tsx','app/page.tsx','components/MonitorAdmin.tsx','components/DisbursementDashboard.tsx','app/api/admin/monitor/route.ts','app/api/disbursement/route.ts','supabase/monitor.sql')) {
  if (-not (Test-Path (Join-Path $repo $required))) { throw "Missing required active project file: $required (make sure previous Monitor update was applied)" }
}
foreach ($rel in @('components/MonitorAdmin.tsx','components/DisbursementDashboard.tsx','components/monitor.css')) {
  Copy-Item (Join-Path $source $rel) (Join-Path $repo $rel) -Force
}
Get-Content (Join-Path $source 'REMOVE-OLD-FILES.txt') | Where-Object {$_ -and -not $_.StartsWith('#')} | ForEach-Object {
  $file = Join-Path $repo $_
  if (Test-Path $file -PathType Leaf) { Remove-Item -LiteralPath $file -Force; Write-Host "Removed $_" }
}
Copy-Item (Join-Path $source 'README-CLEAN.md') (Join-Path $repo 'README.md') -Force
Write-Host "Cleanup applied. Review changes: git status --short"
Write-Host "Then commit and push only after reviewing the diff. No Supabase tables were touched."
