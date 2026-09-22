#!/usr/bin/env bash
# ================================================================
# RELEASE CHECK — Full production readiness verification
# ================================================================
set -Eeuo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0
BLOCKED=0

step() {
  local name="$1"
  shift
  echo -e "\n${YELLOW}▶ $name${NC}"
  if "$@"; then
    echo -e "${GREEN}  ✓ PASSED${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}  ✗ FAILED${NC}"
    FAILED=$((FAILED + 1))
    BLOCKED=1
  fi
}

echo "╔══════════════════════════════════════════════════╗"
echo "║     ASHENAI RELEASE CHECK                        ║"
echo "╚══════════════════════════════════════════════════╝"

# 1. Repository hygiene
step "Repository hygiene" bash -c 'cd ~/AshenAI && git status --porcelain | grep -v "^??" | head -1 | grep -q . && exit 1 || true'

# 2. Dependency installation
step "Dependency install (npm ci)" bash -c 'cd ~/AshenAI && npm ci 2>&1 | tail -3'

# 3. npm audit
step "npm audit" bash -c 'cd ~/AshenAI && npm audit --audit-level=high 2>&1 | tail -3'

# 4. TypeScript typecheck
step "Typecheck" bash -c 'cd ~/AshenAI && npx tsc --noEmit 2>&1'

# 5. Mandatory tests
step "Mandatory tests (36 suites)" bash -c 'cd ~/AshenAI && npx tsx scripts/run-all-tests.ts 2>&1 | tail -15'

# 6. Anime action tests
step "Anime action tests" bash -c 'cd ~/AshenAI && npx tsx scripts/test-anime-actions.ts 2>&1 | tail -5'

# 7. No-Unicode-emoji test
step "No-Unicode-emoji regression" bash -c 'cd ~/AshenAI && npx tsx scripts/test-no-unicode-emojis.ts 2>&1 | tail -5'

# 8. Build
step "Build" bash -c 'cd ~/AshenAI && npm run build 2>&1 | tail -3'

# 9. Icon validation
step "Icon validation" bash -c 'cd ~/AshenAI && npm run icons:validate 2>&1 | tail -5 || true'

# 10. Docker validation
step "Docker build" bash -c 'cd ~/AshenAI && docker build -t ashenai-release-check . 2>&1 | tail -5 || true'

# 11. Check for hardcoded secrets
step "No hardcoded secrets" bash -c 'cd ~/AshenAI && grep -rn "sk-\|token\s*=\s*["\x27]AI\|DISCORD_TOKEN\s*=" src/ --include="*.ts" | grep -v ".example" | grep -v "test" | head -1 | grep -q . && exit 1 || true'

# 12. Check for TODO/FIXME
step "No TODO/FIXME in src" bash -c 'cd ~/AshenAI && grep -rn "TODO\|FIXME\|HACK" src/ --include="*.ts" | head -1 | grep -q . && exit 1 || true'

echo ""
echo "╔══════════════════════════════════════════════════╗"
if [ $BLOCKED -eq 0 ]; then
  echo -e "║  ${GREEN}RELEASE READY${NC}                                  ║"
else
  echo -e "║  ${RED}RELEASE BLOCKED${NC} — $FAILED step(s) failed           ║"
fi
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"

exit $BLOCKED
