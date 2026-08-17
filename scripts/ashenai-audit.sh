#!/data/data/com.termux/files/usr/bin/bash

set +e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOCS="$ROOT/scripts/docs"
mkdir -p "$DOCS"

STAMP="$(date '+%Y%m%d-%H%M%S')"
REPORT="$DOCS/audit-$STAMP.txt"
ARCH="$DOCS/ARCHITECTURE.md"
STATUS="$DOCS/STATUS.md"

exec > >(tee "$REPORT") 2>&1

echo "============================================================"
echo "                 ASHENAI ARCHITECTURE AUDIT"
echo "============================================================"
echo "Date: $(date)"
echo "Project: $ROOT"

echo
echo "============================================================"
echo "1. RUNTIME"
echo "============================================================"

echo "Node: $(node --version 2>/dev/null)"
echo "npm:  $(npm --version 2>/dev/null)"
echo "Platform: $(node -p 'process.platform' 2>/dev/null)"
echo "Arch: $(node -p 'process.arch' 2>/dev/null)"
echo "Kernel: $(uname -a)"
echo "PREFIX: ${PREFIX:-unknown}"

echo
echo "============================================================"
echo "2. PROJECT STRUCTURE"
echo "============================================================"

find src scripts -type f \
  ! -name '*.backup*' \
  ! -name '*.bak' \
  | sort

echo
echo "============================================================"
echo "3. PACKAGE / STARTUP"
echo "============================================================"

node -e '
const p=require("./package.json");
console.log(JSON.stringify({
  name:p.name,
  version:p.version,
  scripts:p.scripts,
  dependencies:p.dependencies,
  devDependencies:p.devDependencies
},null,2));
' 2>/dev/null

echo
echo "--- startup scripts ---"

for f in scripts/*.sh; do
  [ -f "$f" ] || continue
  echo
  echo "### $f"
  sed -n '1,260p' "$f"
done

echo
echo "============================================================"
echo "4. APPLICATION ENTRY"
echo "============================================================"

sed -n '1,360p' src/index.ts 2>/dev/null

echo
echo "============================================================"
echo "5. CONFIGURATION"
echo "============================================================"

sed -n '1,320p' src/config/env.ts 2>/dev/null

echo
echo "============================================================"
echo "6. AI CORE"
echo "============================================================"

echo "--- types ---"
sed -n '1,260p' src/ai/types.ts 2>/dev/null

echo
echo "--- registry ---"
sed -n '1,320p' src/ai/providers/registry.ts 2>/dev/null

echo
echo "--- provider index ---"
sed -n '1,320p' src/ai/providers/index.ts 2>/dev/null

echo
echo "--- provider config ---"
sed -n '1,340p' src/ai/providers/config.ts 2>/dev/null

echo
echo "============================================================"
echo "7. PROVIDERS"
echo "============================================================"

for f in src/ai/providers/*.ts; do
  case "$f" in
    *backup*|*.bak) continue ;;
  esac

  echo
  echo "------------------------------------------------------------"
  echo "$f"
  echo "------------------------------------------------------------"

  sed -n '1,280p' "$f"
done

echo
echo "============================================================"
echo "8. ROUTER"
echo "============================================================"

echo "--- router structure ---"

grep -nE \
  'class |constructor|generate\(|isAvailable|orderedProviders|providerScore|getAvailableProviders|recordSuccess|recordFailure|withTimeout|quarantine|health' \
  src/ai/router.ts 2>/dev/null

echo
echo "--- router source ---"

sed -n '1,1250p' src/ai/router.ts 2>/dev/null

echo
echo "============================================================"
echo "9. CLI / AGENT WIRING"
echo "============================================================"

grep -RniE \
  'child_process|execFile|execFileSync|spawn|spawnSync|execa|command -v|which |stdio|stdin|stdout|stderr' \
  src scripts \
  --exclude='*.backup*' \
  --exclude='*.bak' \
  2>/dev/null || true

echo
echo "--- agent references ---"

grep -RniE \
  'pi|gemini|rayu|aistart|copilot|crush|ollama|agent' \
  src scripts \
  --exclude='*.backup*' \
  --exclude='*.bak' \
  2>/dev/null | head -600 || true

echo
echo "============================================================"
echo "10. DISCORD / COMMAND WIRING"
echo "============================================================"

grep -RniE \
  'Client|login|ready|interaction|interactionCreate|ChatInput|REST|Routes|discord' \
  src \
  --exclude='*.backup*' \
  --exclude='*.bak' \
  2>/dev/null | head -600 || true

echo
echo "============================================================"
echo "11. MEMORY / STORAGE"
echo "============================================================"

grep -RniE \
  'sqlite|postgres|mysql|mongodb|redis|database|prisma|drizzle|memory|writeFile|readFile' \
  src \
  --exclude='*.backup*' \
  --exclude='*.bak' \
  2>/dev/null | head -500 || true

echo
echo "============================================================"
echo "12. INSTALLED AI TOOLS"
echo "============================================================"

for cmd in pi gemini rayu aistart copilot ollama crush; do
  echo
  echo "--- $cmd ---"

  if command -v "$cmd" >/dev/null 2>&1; then
    echo "PATH: $(command -v "$cmd")"
    "$cmd" --version 2>&1 | head -10 || true
  else
    echo "NOT FOUND"
  fi
done

echo
echo "============================================================"
echo "13. GLOBAL AI PACKAGES"
echo "============================================================"

npm list -g --depth=0 2>/dev/null |
  grep -Ei \
  'pi|gemini|rayu|aistart|copilot|crush|ollama|agent' \
  || true

echo
echo "============================================================"
echo "14. OLLAMA"
echo "============================================================"

if command -v ollama >/dev/null 2>&1; then
  ollama --version 2>&1 || true
  echo
  ollama list 2>&1 || true
else
  echo "Ollama not installed"
fi

echo
echo "============================================================"
echo "15. API ENVIRONMENT STATUS"
echo "============================================================"

for v in \
  GEMINI_API_KEY \
  GROQ_API_KEY \
  OPENROUTER_API_KEY \
  OPENAI_API_KEY \
  ANTHROPIC_API_KEY \
  MISTRAL_API_KEY \
  COHERE_API_KEY \
  TOGETHER_API_KEY \
  DEEPSEEK_API_KEY \
  XAI_API_KEY \
  HUGGINGFACE_API_KEY \
  NVIDIA_API_KEY \
  FIREWORKS_API_KEY \
  CEREBRAS_API_KEY \
  SAMBANOVA_API_KEY \
  NOVITA_API_KEY \
  OLLAMA_BASE_URL \
  OLLAMA_MODEL
do
  if [ -n "${!v:-}" ]; then
    printf '%-25s SET\n' "$v"
  else
    printf '%-25s unset\n' "$v"
  fi
done

echo
echo "============================================================"
echo "16. TYPESCRIPT"
echo "============================================================"

npx tsc --noEmit
TSC_EXIT=$?

echo
echo "TypeScript exit code: $TSC_EXIT"

echo
echo "============================================================"
echo "17. STARTUP TEST"
echo "============================================================"

timeout 20s npm start 2>&1
START_EXIT=$?

echo
echo "Startup exit code: $START_EXIT"

echo
echo "============================================================"
echo "18. AUDIT SUMMARY"
echo "============================================================"

if [ "$TSC_EXIT" -eq 0 ]; then
  echo "TypeScript: PASS"
else
  echo "TypeScript: FAIL"
fi

if [ "$START_EXIT" -eq 0 ] || [ "$START_EXIT" -eq 124 ]; then
  echo "Startup: PROCESS STARTED"
else
  echo "Startup: FAIL"
fi

echo
echo "REPORT:"
echo "$REPORT"

echo
echo "============================================================"
echo "AUDIT COMPLETE"
echo "============================================================"

