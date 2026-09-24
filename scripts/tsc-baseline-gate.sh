#!/usr/bin/env bash
# Fail if `tsc --noEmit` reports any error not present in the committed baseline.
# Usage: bash scripts/tsc-baseline-gate.sh
# Baseline path: scripts/tsc-baseline.txt (one "file(line,col): error TSxxxx: ..." per line)
set -euo pipefail

BASELINE="scripts/tsc-baseline.txt"
CURRENT="$(mktemp)"
CURRENT_SORTED="$(mktemp)"
BASELINE_SORTED="$(mktemp)"
NEW_ERRORS="$(mktemp)"
trap 'rm -f "$CURRENT" "$CURRENT_SORTED" "$BASELINE_SORTED" "$NEW_ERRORS"' EXIT

if [[ ! -f "$BASELINE" ]]; then
  echo "❌ Baseline not found: $BASELINE"
  exit 1
fi

set +e
./node_modules/.bin/tsc --noEmit >"$CURRENT" 2>&1
TSC_EXIT=$?
set -e

grep -E "error TS" "$CURRENT" | sed 's/^.*\(src\/.*error TS[0-9].*\)$/\1/' >"$CURRENT_SORTED" || true
sort -u "$CURRENT_SORTED" -o "$CURRENT_SORTED"
sort -u "$BASELINE" -o "$BASELINE_SORTED"

comm -13 "$BASELINE_SORTED" "$CURRENT_SORTED" >"$NEW_ERRORS"

BASELINE_COUNT="$(wc -l <"$BASELINE_SORTED" | tr -d ' ')"
CURRENT_COUNT="$(wc -l <"$CURRENT_SORTED" | tr -d ' ')"
NEW_COUNT="$(wc -l <"$NEW_ERRORS" | tr -d ' ')"

echo "tsc --noEmit exit code: $TSC_EXIT"
echo "Baseline errors: $BASELINE_COUNT"
echo "Current errors:  $CURRENT_COUNT"
echo "New errors:      $NEW_COUNT"

if [[ "$NEW_COUNT" -gt 0 ]]; then
  echo "❌ New TypeScript errors not in baseline:"
  cat "$NEW_ERRORS"
  exit 1
fi

echo "✅ No new TypeScript errors vs baseline ($BASELINE_COUNT known pre-existing)"
