#!/data/data/com.termux/files/usr/bin/bash

set +e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/scripts/docs"
mkdir -p "$DOCS"

STAMP="$(date '+%Y%m%d-%H%M%S')"
OUT="$DOCS/snapshot-$STAMP.md"

cd "$ROOT"

{
echo "# AshenAI Architecture Snapshot"
echo
echo "- Date: $(date)"
echo "- Root: $ROOT"
echo

echo "## Runtime"
echo
echo "- Node: $(node --version 2>/dev/null)"
echo "- npm: $(npm --version 2>/dev/null)"
echo "- Platform: $(node -p 'process.platform' 2>/dev/null)"
echo "- Arch: $(node -p 'process.arch' 2>/dev/null)"
echo

echo "## Live Source"
echo
find src -type f \
  ! -path '*/games.backup-*/*' \
  ! -name '*.backup*' \
  ! -name '*.bak' \
  ! -name '*.broken' \
  ! -name '*.working' \
  ! -name '*.corrupted-backup' \
  ! -name '*.before-*' \
  ! -name '*.final-backup' \
  ! -name '*.phase1-backup' \
  ! -name '*.damaged.*' \
  ! -name '*.corrupted.*' \
  | sort

echo
echo "## Source Counts"
echo
find src -type f \
  ! -path '*/games.backup-*/*' \
  ! -name '*.backup*' \
  ! -name '*.bak' \
  ! -name '*.broken' \
  ! -name '*.working' \
  ! -name '*.corrupted-backup' \
  ! -name '*.before-*' \
  ! -name '*.final-backup' \
  ! -name '*.phase1-backup' \
  ! -name '*.damaged.*' \
  ! -name '*.corrupted.*' \
  | awk -F/ 'NF >= 2 {print $2}' \
  | sort | uniq -c | sort -nr

echo
echo "## Agent"
echo
find src/agent -type f \
  ! -name '*.backup*' \
  ! -name '*.bak' \
  ! -name '*.broken' \
  ! -name '*.working' \
  ! -name '*.corrupted-backup' \
  ! -name '*.before-*' \
  ! -name '*.final-backup' \
  | sort

echo
echo "## AI Providers"
echo
find src/ai/providers -maxdepth 1 -type f \
  ! -name '*.backup*' \
  ! -name '*.bak' \
  | sort

echo
echo "## TypeScript"
echo
npx tsc --noEmit 2>&1
TSC=$?
echo
echo "TypeScript exit code: $TSC"

echo
echo "## Installed AI CLI Tools"
echo

for cmd in pi gemini rayu aistart copilot ollama crush; do
    if command -v "$cmd" >/dev/null 2>&1; then
        printf '%-10s %s\n' "$cmd" "$("$cmd" --version 2>&1 | head -1)"
    else
        printf '%-10s NOT FOUND\n' "$cmd"
    fi
done

echo
echo "## Git State"
echo
git status --short 2>/dev/null || echo "Not a git repository"

echo
echo "## Snapshot"
echo
echo "This snapshot describes the inspected state only."
echo "It does not modify application source."

} > "$OUT"

cp "$OUT" "$DOCS/LATEST-SNAPSHOT.md"

echo "Snapshot created:"
echo "$OUT"
echo
echo "Canonical copy:"
echo "$DOCS/LATEST-SNAPSHOT.md"
