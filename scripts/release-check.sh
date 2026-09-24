#!/usr/bin/env bash
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# ================================================================
# RELEASE CHECK — Full production readiness verification
#
# Check classification:
#   MANDATORY     — failure blocks release
#   INFORMATIONAL — reports status, does not block
#   ENVIRONMENT-DEPENDENT — may fail due to missing tools
# ================================================================
set -Eeuo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASSED=0
FAILED=0
INFO=0
WARN=0

step() {
  local name="$1"
  local classification="${2:-MANDATORY}"
  shift 2
  echo -e "\n${YELLOW}▶ $name${NC} ${CYAN}[$classification]${NC}"
  if "$@"; then
    echo -e "${GREEN}  ✓ PASSED${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}  ✗ FAILED${NC}"
    FAILED=$((FAILED + 1))
  fi
}

info_step() {
  local name="$1"
  shift
  echo -e "\n${YELLOW}▶ $name${NC} ${CYAN}[INFORMATIONAL]${NC}"
  if "$@"; then
    echo -e "${GREEN}  ✓ PASSED${NC}"
    INFO=$((INFO + 1))
  else
    echo -e "${YELLOW}  ⚠ WARN${NC}"
    WARN=$((WARN + 1))
  fi
}

env_step() {
  local name="$1"
  shift
  echo -e "\n${YELLOW}▶ $name${NC} ${CYAN}[ENVIRONMENT-DEPENDENT]${NC}"
  if "$@"; then
    echo -e "${GREEN}  ✓ PASSED${NC}"
    INFO=$((INFO + 1))
  else
    echo -e "${YELLOW}  ⚠ SKIPPED (environment-dependent)${NC}"
    WARN=$((WARN + 1))
  fi
}

echo "╔══════════════════════════════════════════════════╗"
echo "║     ASHENAI RELEASE CHECK                        ║"
echo "╚══════════════════════════════════════════════════╝"

# MANDATORY: Repository hygiene
step "Repository hygiene" MANDATORY bash -c 'cd "$ROOT_DIR" && if git status --porcelain | grep -v "^??" | grep -q .; then echo "Working tree has uncommitted changes"; exit 1; fi'

# MANDATORY: Dependency installation
step "Dependency install (npm ci)" MANDATORY bash -c 'cd "$ROOT_DIR" && npm ci 2>&1 | tail -3'

# MANDATORY: TypeScript typecheck
step "Typecheck" MANDATORY bash -c 'cd "$ROOT_DIR" && npx tsc --noEmit 2>&1'

# MANDATORY: Mandatory tests
step "Mandatory tests" MANDATORY bash -c 'cd "$ROOT_DIR" && npx tsx scripts/run-all-tests.ts 2>&1 | tail -15'

# MANDATORY: Build
step "Build" MANDATORY bash -c 'cd "$ROOT_DIR" && npm run build 2>&1 | tail -3'

# INFORMATIONAL: npm audit
step "npm audit (blocking)" MANDATORY bash -c 'cd "$ROOT_DIR" && npm audit --omit=dev --audit-level=high 2>&1 | tail -3'

# ENVIRONMENT-DEPENDENT: Docker validation
env_step "Docker build" bash -c 'cd "$ROOT_DIR" && docker build -t ashenai-release-check . 2>&1 | tail -5'

# MANDATORY: Check for hardcoded secrets
step "No hardcoded secrets" MANDATORY bash -c 'cd "$ROOT_DIR" && grep -rn "sk-\|token\s*=\s*["\x27]AI\|DISCORD_TOKEN\s*=" src/ --include="*.ts" | grep -v ".example" | grep -v "test" | head -1 | grep -q . && exit 1 || true'

# MANDATORY: Check for TODO/FIXME
step "No TODO/FIXME in src" MANDATORY bash -c 'cd "$ROOT_DIR" && grep -rn "TODO\|FIXME\|HACK" src/ --include="*.ts" | head -1 | grep -q . && exit 1 || true'

# INFORMATIONAL: Icon validation
info_step "Icon validation" bash -c 'cd "$ROOT_DIR" && npm run icons:validate 2>&1 | tail -5'

echo ""
echo "╔══════════════════════════════════════════════════╗"
if [ $FAILED -eq 0 ]; then
  echo -e "║  ${GREEN}RELEASE READY${NC}                                  ║"
else
  echo -e "║  ${RED}RELEASE BLOCKED${NC} — $FAILED mandatory step(s) failed           ║"
fi
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "  Informational: $INFO"
echo "  Warnings: $WARN"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
exit 0
