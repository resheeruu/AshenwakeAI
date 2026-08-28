# U12 Architecture Planning & Readiness Review

**Date:** 2026-08-28  
**Status:** PLANNING ONLY — No code changes  
**Decision Required:** GO / NO-GO for U12 implementation

---

## 1. U1–U11 Completion Summary

| Update | Scope | Commit | Key Deliverable |
|--------|-------|--------|-----------------|
| U1–U2 | Tool framework core | — | Registry, validator, executor, audit pipeline |
| U3 | Read-only Discord tools (5) | — | Server inspect, channels, permissions, config, health |
| U4 | Write Discord tools (4) | — | Create channel/category, rename, move |
| U5 | Management tools (7) | — | Edit, delete, permissions, presets |
| U6 | Protection tools (7) | — | Protect/unprotect channels+categories, audit viewer |
| U7 | Governance tools (9) | `69b0628` | Policy engine, templates, drift detection, remediation |
| U8 | Moderation tools (7) | `06e1b3a` | Warn, timeout, kick, ban, purge, warnings |
| U9 | Tool rate limiting | `5f0e132` | Per-user/guild rate limiter, reservation system, fail-open/closed |
| U10 | Web security perimeter | `ebb71a3` | CORS lockdown, CSRF, session hardening, startup validation |
| U11 | Web security headers | `33996d3` | CSP, X-Frame-Options, HSTS, Permissions-Policy, 196 assertions |

**Total test assertions:** 1,770+ across 10 test suites  
**All passing. TypeScript clean. Build succeeds.**

---

## 2. Current Architecture & Security Review

### Security Module Inventory

| Module | Lines | Stateful | Used | Dead Code |
|--------|:-----:|:--------:|:----:|:---------:|
| `src/security/gateway.ts` | 147 | No | `inspectUserInput` ✅, `sanitizeModelOutput` ❌ | Partial |
| `src/security/output-guard.ts` | 89 | No | `guardAIOutput` ✅ | No |
| `src/security/chat-security.ts` | 71 | No | — | **YES** |
| `src/security/redact.ts` | 91 | No | `redact` ✅ | No |
| `src/security/audit.ts` | 90 | In-memory → JSON | `recordAudit` ✅ | No |
| `src/security/permissions.ts` | ~120 | No | `hasPermission`, `canModerate` ✅ | No |
| `src/security/risk-engine.ts` | ~60 | No | `assessRisk` ✅ | No |
| `src/security/rate-limit.ts` | 129 | In-memory Map | `messageRateLimiter` ✅ | No |
| `src/security/context.ts` | ~50 | No | `wrapUntrustedContent` ✅ | No |
| `src/security/policy.ts` | ~200 | No | `ASHENAI_SYSTEM_PROMPT` ✅ | No |
| `src/security/boundary.ts` | ~40 | No | `checkBoundary` ✅ | No |
| `src/security/tool-permissions.ts` | ~100 | No | `canReadPath`, `canWritePath` ✅ | No |
| `src/security/admin.ts` | ~60 | No | `createSecurityManager` ✅ | No |

### Dead Code Identified

1. **`chat-security.ts` (71 lines):** Never imported by any file in the codebase. `src/security/index.ts` does NOT re-export it. Zero consumers. Contains the weakest pattern set (single-keyword regexes like `/secret/i`, `/token/i`).

2. **`gateway.ts` → `sanitizeModelOutput()` (25 lines of the 147):** Exported and re-exported from `security/index.ts`, but never imported or called anywhere in the codebase. Dead code within an otherwise active module.

### Pattern Duplication Map

| Pattern Set | File | Pattern Count | Detection Focus |
|-------------|------|:-------------:|-----------------|
| `BLOCKED_INPUT_PATTERNS` | gateway.ts | 14 | Jailbreaks, secret requests, env leaks |
| `SECRET_OUTPUT_PATTERNS` | gateway.ts | 6 | API key shapes (sk-*, AIza*, gh*_, AKIA*) |
| `SECRET_PATTERNS` | output-guard.ts | 6 | Credential assignments, private keys, bearer auth |
| `INTERNAL_PATTERNS` | output-guard.ts | 3 | System prompt/config disclosure |
| `SECRET_PATTERNS` | chat-security.ts | 15 | Single-keyword (dead code) |
| `PROMPT_INJECTION_PATTERNS` | chat-security.ts | 12 | Jailbreaks (dead code) |
| `SECRET_PATTERNS` | redact.ts | 11 | AWS, Google, GitHub, Slack, Discord, JWT |

**Overlap analysis:**
- `gateway.ts` OUTPUT patterns (6) vs `output-guard.ts` SECRET patterns (6): **~50% overlap** — both detect API key shapes, credential assignments
- `output-guard.ts` INTERNAL patterns (3) vs `gateway.ts` INPUT patterns (5 internal-related): **Partial overlap** — both detect system prompt/config disclosure
- `redact.ts` (11 patterns): **Most comprehensive** for output — covers providers the others miss (AWS, GitHub, Slack, JWT)
- `chat-security.ts` (15+12 patterns): **Dead code** — worst quality (single-keyword false positives), zero consumers

### Active Code Flow (Post U1–U11)

```
Discord Message
  → rate-limit.ts (messageRateLimiter: 10/60s)
  → gateway.ts → inspectUserInput() [14 input patterns]
  → AI generation
  → output-guard.ts → guardAIOutput() [6 secret + 3 internal patterns]
  → Discord delivery

Web API Request
  → server.ts: CORS → Security Headers (U11) → Rate Limit → Auth → CSRF → Route
  → control/auth.ts: session validation
  → tool execution pipeline (U1-U9)
```

**Key finding:** `gateway.ts`'s `sanitizeModelOutput()` is never called in the active code flow. Only `inspectUserInput()` is used (from `ask.ts`). The output check is handled solely by `output-guard.ts`'s `guardAIOutput()`.

---

## 3. U12 Candidate Proposals

### Candidate A: Security Pattern Consolidation

**Scope:** Create `src/security/patterns.ts` as the single source of truth for all detection patterns. Refactor `gateway.ts`, `output-guard.ts`, and `redact.ts` to import from it. Delete `chat-security.ts` (dead code). Remove `sanitizeModelOutput` from `gateway.ts` (dead code).

| Dimension | Rating |
|-----------|--------|
| Security impact | MEDIUM — eliminates pattern drift, removes dead code that could confuse auditors |
| Architectural value | HIGH — single source of truth, 35% reduction in security module code |
| Complexity | LOW — refactoring only, no behavior changes |
| Regression risk | LOW — patterns are moved, not changed; test coverage catches drift |
| Prerequisites | None |

### Candidate B: Dead Code Removal (Standalone)

**Scope:** Delete `chat-security.ts` (71 lines) and remove `sanitizeModelOutput` from `gateway.ts` (~25 lines). No consolidation.

| Dimension | Rating |
|-----------|--------|
| Security impact | LOW — removes confusion but doesn't address pattern drift |
| Architectural value | MEDIUM — cleaner codebase |
| Complexity | TRIVIAL — delete 2 code sections |
| Regression risk | ZERO — no consumers |
| Prerequisites | None |

### Candidate C: Rate Limiter Persistence

**Scope:** Persist `tool-rate-limit.ts` and `rate-limit.ts` state to disk so limits survive restarts.

| Dimension | Rating |
|-----------|--------|
| Security impact | MEDIUM — closes "restart to reset" attack vector |
| Architectural value | LOW-MEDIUM |
| Complexity | HIGH — multiple Map serialization, timing windows, race conditions |
| Regression risk | HIGH — changes rate limiting behavior globally |
| Prerequisites | None |

### Candidate D: Session Persistence

**Scope:** Move `auth.ts` sessions from in-memory Map to file-based persistence.

| Dimension | Rating |
|-----------|--------|
| Security impact | MEDIUM — sessions survive restarts |
| Architectural value | MEDIUM |
| Complexity | MEDIUM — file I/O, serialization, cleanup |
| Regression risk | MEDIUM — changes auth flow |
| Prerequisites | None |

### Candidate E: Router Log Message Bug Fix

**Scope:** Fix `router.ts` line 670 which says "quarantined for 6 hours" when the actual quarantine is 5 minutes.

| Dimension | Rating |
|-----------|--------|
| Security impact | LOW — cosmetic |
| Architectural value | LOW |
| Complexity | TRIVIAL |
| Regression risk | ZERO |
| Prerequisites | None |

---

## 4. Candidate Comparison Matrix

| Criterion | A: Consolidation | B: Dead Code | C: Rate Persist | D: Session Persist | E: Log Fix |
|-----------|:-----------------:|:------------:|:---------------:|:------------------:|:----------:|
| Security impact | ★★★ | ★ | ★★ | ★★ | ★ |
| Architectural value | ★★★★ | ★★ | ★★ | ★★★ | ★ |
| Complexity | ★★ | ★ | ★★★★★ | ★★★ | ★ |
| Regression risk | ★ | ☆ | ★★★★★ | ★★★ | ☆ |
| **Overall** | **Best** | Good | Poor | Good | Skip |

---

## 5. Recommended U12 Scope: Security Pattern Consolidation

**Decision: GO for Candidate A**

Rationale:
- **Highest architectural value** — creates a single source of truth for all security detection patterns
- **Removes dead code** — eliminates `chat-security.ts` (71 lines of orphaned, inferior patterns) and `sanitizeModelOutput` (dead export)
- **Prevents pattern drift** — four independent regex sets currently can diverge silently; consolidation means one update covers all consumers
- **Low complexity** — pure refactoring; patterns are moved, not created
- **Low regression risk** — existing test suites (1,770+ assertions) validate that detection behavior is preserved
- **Natural follow-up** — U10/U11 hardened the web perimeter; U12 cleans up the security module internals
- **Prepares for future** — a single patterns.ts makes it trivial to add new patterns (e.g., for AI provider key detection) without hunting across 4 files

Candidate B (dead code only) is a subset of A and would be redundant. Candidates C and D add significant complexity for marginal gain in a single-owner bot context. Candidate E is too trivial to warrant a full update.

---

## 6. Proposed Architecture & Data Flow

### New Module: `src/security/patterns.ts`

```
src/security/patterns.ts
├── INPUT_BLOCK_PATTERNS: RegExp[]         (from gateway.ts BLOCKED_INPUT_PATTERNS)
├── OUTPUT_SECRET_PATTERNS: RegExp[]       (union of gateway.ts + output-guard.ts + redact.ts)
├── OUTPUT_INTERNAL_PATTERNS: RegExp[]     (from output-guard.ts INTERNAL_PATTERNS)
└── REDACTION_RULES: RedactionRule[]       (from redact.ts SECRET_PATTERNS)
```

### Refactored Consumers

```
src/security/gateway.ts
  → imports INPUT_BLOCK_PATTERNS, OUTPUT_SECRET_PATTERNS from ./patterns
  → inspectUserInput() uses INPUT_BLOCK_PATTERNS
  → sanitizeModelOutput() REMOVED (dead code)

src/security/output-guard.ts
  → imports OUTPUT_SECRET_PATTERNS, OUTPUT_INTERNAL_PATTERNS from ./patterns
  → guardAIOutput() uses both

src/security/redact.ts
  → imports REDACTION_RULES from ./patterns
  → redact() uses REDACTION_RULES
```

### Deleted Files
```
src/security/chat-security.ts  → DELETED (dead code, 71 lines)
```

### Data Flow (Unchanged)

```
Discord Message
  → rate-limit.ts (messageRateLimiter)
  → gateway.ts → inspectUserInput() [INPUT_BLOCK_PATTERNS from patterns.ts]
  → AI generation
  → output-guard.ts → guardAIOutput() [OUTPUT_SECRET_PATTERNS + OUTPUT_INTERNAL_PATTERNS from patterns.ts]
  → Discord delivery

Logging/audit
  → redact.ts → redact() [REDACTION_RULES from patterns.ts]
```

**No behavioral change.** Same patterns, same detection, same results. Only the source of truth moves.

---

## 7. Files to Create or Modify

### Created Files
| File | Purpose |
|------|---------|
| `src/security/patterns.ts` | Single source of truth for all detection patterns |
| `scripts/test-security-patterns.ts` | Test suite: pattern coverage, equivalence, dead code verification |

### Modified Files
| File | Change |
|------|--------|
| `src/security/gateway.ts` | Import INPUT_BLOCK_PATTERNS, OUTPUT_SECRET_PATTERNS from `./patterns`. Remove local pattern arrays. Remove `sanitizeModelOutput` function (dead code). |
| `src/security/output-guard.ts` | Import OUTPUT_SECRET_PATTERNS, OUTPUT_INTERNAL_PATTERNS from `./patterns`. Remove local pattern arrays. |
| `src/security/redact.ts` | Import REDACTION_RULES from `./patterns`. Remove local pattern array. |
| `src/security/index.ts` | Remove `sanitizeModelOutput` re-export (dead code). Remove chat-security re-export (never existed, but verify). |

### Deleted Files
| File | Reason |
|------|--------|
| `src/security/chat-security.ts` | Dead code — never imported, never called, contains weakest patterns |

### NOT Modified
| File | Reason |
|------|--------|
| `src/commands/ask.ts` | Imports `inspectUserInput` from `gateway.ts` — path unchanged |
| `src/index.ts` | Imports `guardAIOutput` from `output-guard.ts` — path unchanged |
| `src/ai/tools/audit.ts` | Imports `redact` from `redact.ts` — path unchanged |
| `src/control/auth.ts` | Imports `recordAudit` from `audit.ts` — unrelated |
| All test files | No changes needed — behavior is preserved |

---

## 8. Security Requirements & Invariants

### Invariants (must hold after consolidation)

1. **Pattern coverage must be identical** — every regex in the old files must appear in the new `patterns.ts`
2. **`inspectUserInput()` must detect the same inputs** — all 14 input patterns preserved
3. **`guardAIOutput()` must detect the same outputs** — all 6 secret + 3 internal patterns preserved
4. **`redact()` must redact the same values** — all 11 redaction rules preserved
5. **No new patterns added** — U12 is consolidation, not expansion
6. **No patterns removed** — unless they are confirmed dead code (chat-security.ts only)
7. **`sanitizeModelOutput` removal must not break anything** — verified dead code (zero callers)
8. **`chat-security.ts` deletion must not break anything** — verified dead code (zero imports)

### Security Properties Preserved

- **Input blocking:** Jailbreak attempts, secret requests, env leaks, identity spoofing → still blocked by `inspectUserInput()`
- **Output blocking:** API key shapes, credential assignments, private keys, bearer tokens → still blocked by `guardAIOutput()`
- **Output internal protection:** System prompt/config disclosure → still blocked by `guardAIOutput()`
- **Log redaction:** AWS, Google, GitHub, Slack, Discord, JWT tokens → still redacted by `redact()`
- **Defense in depth:** Multiple layers (input → output → redaction) maintained with shared patterns

---

## 9. Test Plan (200+ Assertions)

### Test Section A: Pattern Coverage Equivalence (60+ assertions)
- Every INPUT_BLOCK_PATTERNS entry detects the same strings as old gateway.ts patterns
- Every OUTPUT_SECRET_PATTERNS entry detects the same strings as old output-guard.ts + gateway.ts patterns
- Every OUTPUT_INTERNAL_PATTERNS entry detects the same strings as old output-guard.ts patterns
- Every REDACTION_RULES entry redacts the same strings as old redact.ts patterns
- Pattern counts match: INPUT (14), OUTPUT_SECRET (union, deduplicated), OUTPUT_INTERNAL (3), REDACTION (11)

### Test Section B: inspectUserInput Equivalence (30+ assertions)
- All 14 original input detection tests pass
- Jailbreak patterns detected
- Secret request patterns detected
- Environment leak patterns detected
- Identity spoofing patterns detected
- Clean inputs allowed

### Test Section C: guardAIOutput Equivalence (30+ assertions)
- All 6 original output secret detection tests pass
- All 3 original output internal detection tests pass
- API key shapes blocked
- Credential assignments blocked
- Private keys blocked
- Clean outputs allowed

### Test Section D: redact Equivalence (30+ assertions)
- AWS key redaction works
- Google API key redaction works
- GitHub token redaction works
- Slack token redaction works
- Discord token redaction works
- JWT token redaction works
- Bearer token redaction works
- Key-value assignment redaction works (preserves key name)

### Test Section E: Dead Code Verification (20+ assertions)
- `chat-security.ts` does NOT exist (or is empty)
- `gateway.ts` does NOT export `sanitizeModelOutput`
- `security/index.ts` does NOT re-export `sanitizeModelOutput`
- No file in `src/` imports from `chat-security`
- No file in `src/` calls `sanitizeModelOutput`

### Test Section F: Module Structure (20+ assertions)
- `patterns.ts` exports INPUT_BLOCK_PATTERNS as array
- `patterns.ts` exports OUTPUT_SECRET_PATTERNS as array
- `patterns.ts` exports OUTPUT_INTERNAL_PATTERNS as array
- `patterns.ts` exports REDACTION_RULES as array
- All arrays are non-empty
- All entries are RegExp (patterns) or objects with pattern+replacement (redaction)
- No duplicate patterns within each array

### Test Section G: Edge Cases (20+ assertions)
- Empty string input does not crash any function
- Very long input does not crash
- Unicode input does not crash
- Pattern arrays are frozen/immutable (optional, but good practice)
- Importing patterns.ts does not cause side effects

**Total estimated assertions: 210+**

---

## 10. Regression Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| Pattern lost during consolidation | LOW | HIGH | Diff all 4 old pattern sets against new patterns.ts; test every pattern |
| `sanitizeModelOutput` removal breaks unknown consumer | NONE | HIGH | Grep confirmed zero callers in entire codebase |
| `chat-security.ts` deletion breaks unknown consumer | NONE | HIGH | Grep confirmed zero imports in entire codebase |
| Pattern order changes detection behavior | LOW | MEDIUM | Order within arrays does not matter (all patterns are checked, first match wins only for early-return; none of these functions early-return on first match) |
| Import path changes break consumers | NONE | HIGH | gateway.ts, output-guard.ts, redact.ts keep same export signatures; consumers (ask.ts, index.ts) import from same paths |
| New patterns.ts introduces syntax errors | LOW | LOW | TypeScript compiler catches at build time |

**Overall regression risk: LOW**

The key safety guarantee: **no consumer changes their import path.** `gateway.ts` still exports `inspectUserInput`. `output-guard.ts` still exports `guardAIOutput`. `redact.ts` still exports `redact`. The only change is where the pattern arrays are defined.

---

## 11. Implementation Phases

### Phase 1: Create `src/security/patterns.ts`
- Define `INPUT_BLOCK_PATTERNS` (14 patterns from gateway.ts)
- Define `OUTPUT_SECRET_PATTERNS` (union of gateway.ts OUTPUT + output-guard.ts SECRET + redact.ts, deduplicated)
- Define `OUTPUT_INTERNAL_PATTERNS` (3 patterns from output-guard.ts)
- Define `REDACTION_RULES` (11 rules from redact.ts)
- Duration: ~20 minutes

### Phase 2: Refactor `gateway.ts`
- Import patterns from `./patterns`
- Remove local `BLOCKED_INPUT_PATTERNS` and `SECRET_OUTPUT_PATTERNS` arrays
- Remove `sanitizeModelOutput` function and its export
- Keep `inspectUserInput`, `getCreatorResponse`, `isChatAuthentication`
- Duration: ~15 minutes

### Phase 3: Refactor `output-guard.ts`
- Import patterns from `./patterns`
- Remove local `SECRET_PATTERNS` and `INTERNAL_PATTERNS` arrays
- Keep `guardAIOutput` function and its export
- Duration: ~10 minutes

### Phase 4: Refactor `redact.ts`
- Import `REDACTION_RULES` from `./patterns`
- Remove local `SECRET_PATTERNS` array
- Keep `redact`, `redactLogMessage` functions and exports
- Duration: ~10 minutes

### Phase 5: Delete dead code
- Delete `src/security/chat-security.ts`
- Remove `sanitizeModelOutput` from `src/security/index.ts` re-exports
- Duration: ~5 minutes

### Phase 6: Test suite
- Create `scripts/test-security-patterns.ts`
- Implement all 210+ assertions
- Run and verify all pass
- Duration: ~45 minutes

### Phase 7: Regression verification
- Run full U1–U11 regression suite (1,770+ assertions)
- Run `npx tsc --noEmit`
- Run `npm run build`
- Run `git diff --check`
- Duration: ~15 minutes

### Phase 8: Final verification & report
- Run U12 tests one final time
- Generate implementation report
- Wait for user approval before commit
- Duration: ~10 minutes

**Total estimated time: ~130 minutes**

---

## 12. Scope Boundaries: What U12 Will NOT Include

Explicitly excluded from U12 scope:

1. **No new patterns added** — consolidation only, not expansion
2. **No pattern behavior changes** — same detections, same results
3. **No rate limiter persistence** (Candidate C) — deferred
4. **No session persistence** (Candidate D) — deferred
5. **No circuit breaker implementation** — deferred
6. **No test framework migration** — deferred
7. **No audit integrity (HMAC/signatures)** — deferred
8. **No changes to authentication, CORS, CSRF, or security headers** (U10/U11)
9. **No changes to Discord tools, rate limiting, or governance** (U1–U9)
10. **No new environment variables**
11. **No database migration**
12. **No changes to `src/commands/ask.ts`** — it imports from gateway.ts which keeps its export signature
13. **No changes to `src/index.ts`** — it imports from output-guard.ts which keeps its export signature
14. **No router.ts log message fix** — too trivial for a standalone update; can be folded into a future cleanup

---

## 13. GO/NO-GO Decision

### GO Criteria (all met)

- [x] All U1–U11 tests pass (1,770+ assertions)
- [x] TypeScript compiles cleanly
- [x] Build succeeds
- [x] U12 scope is well-defined and bounded
- [x] Dead code is verified (zero imports, zero callers)
- [x] No prerequisites required
- [x] Regression risk is LOW
- [x] Implementation is purely refactoring (no behavior changes)
- [x] All files to modify/create/delete are identified
- [x] Test plan has 200+ assertions
- [x] Security invariants are defined
- [x] No consumer import paths change

### Decision: **GO**

U12 (Security Pattern Consolidation) is ready for implementation. The scope is tight, the risk is low, and the architectural value is high. This completes the security module cleanup: U10 hardened the web perimeter, U11 added browser enforcement headers, and U12 eliminates dead code and creates a single source of truth for all detection patterns.

---

## 14. Summary

U12 will consolidate the security pattern architecture:

- **Create** `src/security/patterns.ts` — single source of truth for all detection patterns
- **Refactor** `gateway.ts`, `output-guard.ts`, `redact.ts` — import from patterns.ts
- **Delete** `chat-security.ts` — 71 lines of dead code with zero consumers
- **Remove** `sanitizeModelOutput` — dead export with zero callers
- **Test** 210+ assertions verifying pattern equivalence and dead code removal

This is the "clean the vault" update: no new security features, no behavior changes, just architectural hygiene that makes the codebase safer to maintain and audit.
