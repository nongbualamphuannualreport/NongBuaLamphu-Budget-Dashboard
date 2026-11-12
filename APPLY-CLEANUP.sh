#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${1:-.}" && pwd)"
[ -d "$REPO/.git" ] || { echo 'Provide a local cloned Git repository path'; exit 1; }
for f in app/admin/page.tsx app/page.tsx components/MonitorAdmin.tsx components/DisbursementDashboard.tsx app/api/admin/monitor/route.ts app/api/disbursement/route.ts supabase/monitor.sql; do
  [ -f "$REPO/$f" ] || { echo "Missing required project file: $f"; exit 1; }
done
cp "$SOURCE/components/MonitorAdmin.tsx" "$REPO/components/MonitorAdmin.tsx"
cp "$SOURCE/components/DisbursementDashboard.tsx" "$REPO/components/DisbursementDashboard.tsx"
cp "$SOURCE/components/monitor.css" "$REPO/components/monitor.css"
while IFS= read -r f; do
 [[ -z "$f" || "$f" == \#* ]] && continue
 [ ! -f "$REPO/$f" ] || rm -- "$REPO/$f"
done < "$SOURCE/REMOVE-OLD-FILES.txt"
cp "$SOURCE/README-CLEAN.md" "$REPO/README.md"
echo 'Cleanup applied. Inspect git status --short before commit/push.'
