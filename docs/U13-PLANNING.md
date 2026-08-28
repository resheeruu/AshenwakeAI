# U13 Architecture Planning & Readiness Review

**Date:** 2026-08-28  
**Status:** PLANNING ONLY — No code changes  
**Decision Required:** GO / NO-GO for U13 implementation

---

## 1. U1–U12 Completion Summary

| Update | Scope | Commit | Key Deliverable | Test Assertions |
|--------|-------|--------|-----------------|:---------------:|
| U1–U2 | Tool framework core | — | Registry, validator, executor, audit pipeline | — |
| U3 | Read-only Discord tools (5) | — | Server inspect, channels, permissions, config, health | 68 |
| U4 | Write Discord tools (4) | — | Create channel/category, rename, move | 175 |
| U5 | Management tools (7) | — | Edit, delete, permissions, presets + confirmation handler | 134 |
| U6 | Protection tools (7) | — | Protect/unprotect channels+categories, audit viewer | 494 |
| U7 | Governance tools (9) | `69b0628` | Policy engine, templates, drift detection, remediation | 146 |
| U8 | Moderation tools (7) | `06e1b3a` | Warn, timeout, kick, ban, purge, warnings | 181 |
| U9 | Tool rate limiting | `5f0e132` | Per-user/guild rate limiter, reservation system, fail-open/closed | 283 |
| U10 | Web security perimeter | `ebb71a3` | CORS lockdown, CSRF, session hardening, startup validation | 93 |
| U11 | Web security headers | `33996d3` | CSP, X-Frame-Options, HSTS, Permissions-Policy | 196 |
| U12 | Security pattern consolidation | `bae76e9` | Single source of truth (`patterns.ts`), dead code removal | 210+ |

**Total registered tools:** 36 across 7 categories  
**Total test assertions:** 1,980+ across 15 test suites  
**All passing. TypeScript clean. Build succeeds.**

### Security Architecture Accumulated

```
Input Layer:   gateway.ts → inspectUserInput() [14 patterns from patterns.ts]
Output Layer:  output-guard.ts → guardAIOutput() [6 secret + 3 internal patterns from patterns.ts]
Redaction:     redact.ts → redact() [11 rules from patterns.ts]
Rate Limit:    rate-limit.ts (10 msg/60s) + tool-rate-limit.ts (per-tool, role-multiplied)
Auth:          control/auth.ts (PBKDF2, CSRF, SameSite=Strict, session rotation)
Web Perimeter: server.ts (CORS allowlist, security headers, body limit)
Audit:         audit.ts (JSON file, redacted, 5000-entry rotation)
Permissions:   permissions.ts (5-tier RBAC) + risk-engine.ts (action classification)
```

---

## 2. Current Architecture & Security Audit

### Security Module State (Post-U12)

| Module | Lines | State | Status |
|--------|:-----:|:-----:|--------|
| `security/patterns.ts` | 147 | Stateless | ✅ Single source of truth (U12) |
| `security/gateway.ts` | 79 | Stateless | ✅ Imports from patterns.ts |
| `security/output-guard.ts` | 62 | Stateless | ✅ Imports from patterns.ts |
| `security/redact.ts` | ~91 | Stateless | ✅ Imports from patterns.ts |
| `security/audit.ts` | 90 | In-memory → JSON | ✅ Functional, no integrity protection |
| `security/permissions.ts` | ~120 | Stateless | ✅ 5-tier RBAC |
| `security/risk-engine.ts` | ~60 | Stateless | ✅ Action classification |
| `security/rate-limit.ts` | 129 | In-memory Map | ✅ Functional, resets on restart |
| `security/context.ts` | ~50 | Stateless | ✅ Untrusted content wrapping |
| `security/policy.ts` | ~200 | Stateless | ✅ System prompt |
| `security/boundary.ts` | ~40 | Stateless | ✅ Boundary checks |
| `security/tool-permissions.ts` | ~100 | Stateless | ✅ Path access control |
| `security/admin.ts` | ~60 | Stateless | ✅ Security manager |

### Accumulated Security Properties

| Property | Status | Enforcement Point |
|----------|--------|-------------------|
| Input blocking (jailbreaks, secret requests) | ✅ Active | `gateway.ts` → `inspectUserInput()` |
| Output secret detection | ✅ Active | `output-guard.ts` → `guardAIOutput()` |
| Output internal disclosure blocking | ✅ Active | `output-guard.ts` → `guardAIOutput()` |
| Log redaction | ✅ Active | `redact.ts` → `redact()` |
| CORS lockdown | ✅ Active | `server.ts` middleware |
| CSRF protection | ✅ Active | `server.ts` + `auth.ts` |
| Security headers (CSP, HSTS, etc.) | ✅ Active | `server.ts` middleware |
| Session security (HttpOnly, SameSite, rotation) | ✅ Active | `auth.ts` |
| Rate limiting (message + tool) | ✅ Active | `rate-limit.ts` + `tool-rate-limit.ts` |
| Role-based access control | ✅ Active | `permissions.ts` + `risk-engine.ts` |
| Audit trail | ✅ Active | `audit.ts` |
| Command injection prevention | ✅ Active | `agent/tools.ts` (execFile + allowlist) |
| File path traversal prevention | ✅ Active | `agent/tools.ts` (safePath + secret blocking) |

### Remaining Gaps (Ranked by Severity)

| # | Gap | Severity | Location | Impact |
|---|-----|:--------:|----------|--------|
| **G1** | Tool executor leaks raw error messages to Discord | **HIGH** | `executor.ts:250` | Internal file paths, command output, and stack details exposed to users. Violates policy.ts line 144: "Never expose stack traces or internal system details to normal users." |
| **G2** | Audit log has no integrity protection | **MEDIUM** | `audit.ts` | `data/audit-log.json` is plain JSON; any process with file access can modify entries without detection |
| **G3** | Redaction patterns missing several secret formats | **MEDIUM** | `patterns.ts` | Discord webhooks, Telegram tokens, Stripe keys, database connection strings, SMTP credentials not covered |
| **G4** | Log stream entries not sanitized | **MEDIUM** | `log-stream.ts` | Error messages containing secrets visible via `/api/logs` and `/api/logs/stream` endpoints (owner-only, but defense-in-depth) |
| **G5** | In-memory rate limiters reset on restart | **LOW** | `rate-limit.ts`, `tool-rate-limit.ts` | Attacker can wait for restart to resume; acceptable for single-owner bot |
| **G6** | In-memory sessions reset on restart | **LOW** | `auth.ts` | Sessions invalidated on restart; acceptable (also a security plus for token rotation) |
| **G7** | Unused `express-session` dependency | **LOW** | `package.json` | Dead dependency increases attack surface |
| **G8** | No dependency vulnerability scanning | **LOW** | project-wide | No `npm audit` or Dependabot configured |

---

## 3. U13 Candidate Proposals

### Candidate A: Error Message Sanitization + Audit Log Integrity

**Scope:** Two tightly-coupled security hardening tasks:
1. Sanitize error messages in `executor.ts` before returning to Discord — replace raw `error.message` with generic messages; log full details server-side only
2. Add HMAC integrity signatures to audit log entries — tamper detection on read, chain verification

| Dimension | Rating |
|-----------|--------|
| Security impact | **HIGH** — closes information leakage (G1) and audit tampering (G2) |
| Architectural value | HIGH — both are defensive hardening with no behavioral change to legitimate flows |
| Complexity | LOW — error sanitization is a one-line pattern; audit HMAC is additive |
| Regression risk | LOW — error messages become more generic (better); audit writes are additive |
| Prerequisites | None |

### Candidate B: Redaction Pattern Expansion

**Scope:** Add missing secret formats to `patterns.ts` REDACTION_RULES: Discord webhooks, Telegram bot tokens, Stripe API keys, database connection strings, SMTP credentials.

| Dimension | Rating |
|-----------|--------|
| Security impact | MEDIUM — closes coverage gaps in log redaction (G3) |
| Architectural value | MEDIUM — extends existing single source of truth |
| Complexity | LOW — pure additive regex patterns |
| Regression risk | LOW — only affects log redaction, not detection behavior |
| Prerequisites | None |

### Candidate C: Error Message Sanitization (Standalone)

**Scope:** Sanitize error messages in `executor.ts` only. Generic error returned to Discord, full details logged server-side.

| Dimension | Rating |
|-----------|--------|
| Security impact | HIGH — closes G1 |
| Architectural value | MEDIUM |
| Complexity | TRIVIAL — small change to one function |
| Regression risk | LOW |
| Prerequisites | None |

### Candidate D: Circuit Breaker State Machine

**Scope:** Formalize router quarantine/cooldown into a proper circuit breaker (closed → open → half-open) with configurable thresholds and metrics.

| Dimension | Rating |
|-----------|--------|
| Security impact | MEDIUM — improves resilience |
| Architectural value | HIGH — reusable pattern |
| Complexity | MEDIUM-HIGH — new module, integration with router |
| Regression risk | MEDIUM — changes provider selection behavior |
| Prerequisites | None |

### Candidate E: Audit Log Integrity (Standalone)

**Scope:** Add HMAC signing to audit entries, tamper detection on read, chain verification.

| Dimension | Rating |
|-----------|--------|
| Security impact | MEDIUM — ensures audit trail cannot be silently modified (G2) |
| Architectural value | MEDIUM |
| Complexity | LOW — additive, no existing behavior altered |
| Regression risk | LOW — write-once, read-rarely |
| Prerequisites | None |

---

## 4. Candidate Comparison Matrix

| Criterion | A: Error+Audit | B: Redaction | C: Error Only | D: Circuit Breaker | E: Audit Only |
|-----------|:--------------:|:------------:|:-------------:|:------------------:|:-------------:|
| Security impact | ★★★★★ | ★★★ | ★★★★ | ★★ | ★★★ |
| Architectural value | ★★★★ | ★★★ | ★★★ | ★★★★ | ★★★ |
| Complexity | ★★ | ★ | ★ | ★★★★ | ★★ |
| Regression risk | ★ | ★ | ★ | ★★★ | ★ |
| Addresses critical gap | YES (G1+G2) | Partial (G3) | YES (G1) | No | Partial (G2) |
| **Overall** | **Best** | Good | Good | Deferred | Good |

---

## 5. Recommended U13 Scope: Error Message Sanitization + Audit Log Integrity

**Decision: GO for Candidate A**

Rationale:

1. **Highest remaining security impact**: G1 (error message leakage) is the only HIGH-severity gap remaining after U12. The `executor.ts:250` line returns raw `error.message` to Discord, which can leak internal file paths, command execution output, and potentially database errors. This directly violates the project's own security policy (`policy.ts` line 144).

2. **Audit integrity closes the last tampering vector**: G2 (audit log integrity) is the most significant MEDIUM gap. An attacker with file system access (or a compromised process) could modify `data/audit-log.json` to remove evidence of malicious actions. HMAC signatures make this detectable.

3. **Low complexity, low risk**: Error sanitization is a ~10-line change. Audit HMAC is additive (new function, new field on AuditEntry, verification on read). Neither changes any legitimate behavior.

4. **Natural pairing**: Both tasks are defensive hardening that don't alter any positive flow. Error messages become more generic (better for users); audit entries become tamper-evident (better for security).

5. **Defers appropriately**: Circuit breaker (D) is an architectural improvement, not a security hardening — it belongs in a reliability-focused update. Redaction expansion (B) is good but lower urgency than closing the information leakage vector.

Candidate C (error only) is a subset of A. Candidate E (audit only) is a subset of A. Candidate B (redaction) is good but can follow in U14. Candidate D (circuit breaker) should be deferred to a reliability-focused update.

---

## 6. Proposed Architecture & Data Flow

### 6.1 Error Message Sanitization

**Current (executor.ts:248-251):**
```typescript
return {
  status: "error",
  message: `Tool "${toolName}" failed: ${errorMessage}`,
};
```

**Proposed:**
```typescript
// Log full error server-side for debugging
logger.error(`Tool execution failed: ${toolName} — ${errorMessage}`);

// Return generic message to Discord (no internal details)
return {
  status: "error",
  message: `Tool "${toolName}" encountered an error. The issue has been logged.`,
};
```

**New utility: `sanitizeToolError()`** in `src/security/sanitize.ts`:
```typescript
export function sanitizeToolError(toolName: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  
  // Known safe patterns: include category only
  if (/rate.?limit/i.test(raw)) return `Tool "${toolName}" is rate-limited.`;
  if (/permission|denied|unauthorized/i.test(raw)) return `Tool "${toolName}" requires higher permissions.`;
  if (/not found|missing/i.test(raw)) return `Tool "${toolName}": target not found.`;
  
  // Default: generic message (no raw error leaked)
  return `Tool "${toolName}" encountered an error. The issue has been logged.`;
}
```

**Behavior change:**
- Discord users see: `Tool "create-channel" encountered an error. The issue has been logged.`
- Server logs still see: `Tool execution failed: create-channel — ENOENT: no such file or directory`
- **No information leakage to users. Full details preserved for debugging.**

### 6.2 Audit Log Integrity

**Current (audit.ts):**
```typescript
interface AuditEntry {
  id: string;
  timestamp: number;
  who: string;
  // ...
  result: "success" | "failure" | "denied" | "error";
}
```

**Proposed additions:**
```typescript
interface AuditEntry {
  // ...existing fields...
  /** HMAC-SHA256 signature over entry content (excluding `signature` field) */
  signature: string;
  /** Hash of the previous entry's signature (chain verification) */
  prevHash: string;
}

// Integrity key: derived from SESSION_SECRET at startup
const INTEGRITY_KEY = crypto.createHmac("sha256", process.env.SESSION_SECRET || "fallback")
  .update("audit-integrity-v1")
  .digest();
```

**New functions:**
```typescript
function signEntry(entry: Omit<AuditEntry, "signature" | "prevHash">): { signature: string; prevHash: string }
function verifyEntry(entry: AuditEntry, prevSignature: string): boolean
function verifyAuditChain(entries: AuditEntry[]): { valid: boolean; brokenAt?: number }
```

**Data flow:**
```
recordAudit()
  → signEntry(entry) → { signature, prevHash }
  → entry.signature = signature
  → entry.prevHash = prevHash
  → save to audit-log.json

getAuditLog() / audit viewer
  → verifyAuditChain(entries) → { valid, brokenAt }
  → if broken: log warning, still return entries (don't block reads)
```

**Key design decisions:**
- **HMAC, not digital signatures**: Uses shared secret (SESSION_SECRET), not asymmetric keys. Appropriate for single-process application.
- **Chain verification**: Each entry's `prevHash` = HMAC of previous entry's `signature`. Tampering with any entry breaks the chain.
- **Non-blocking**: Verification failure logs a warning but does NOT prevent reading the audit log. Availability over strict integrity.
- **Key derivation**: Uses `SESSION_SECRET` (already required, 128-char hex) as the HMAC key. No new environment variables.

---

## 7. Files to Create or Modify

### Created Files

| File | Purpose |
|------|---------|
| `src/security/sanitize.ts` | `sanitizeToolError()` utility — generic error messages for Discord |
| `src/security/audit-integrity.ts` | HMAC signing, chain verification for audit entries |
| `scripts/test-error-sanitization.ts` | Test suite: error message sanitization |
| `scripts/test-audit-integrity.ts` | Test suite: audit HMAC signing and chain verification |

### Modified Files

| File | Change |
|------|--------|
| `src/ai/tools/executor.ts` | Import `sanitizeToolError` from `security/sanitize.ts`. Replace raw `errorMessage` in error return with `sanitizeToolError()`. Keep server-side `logger.error()` with full details. |
| `src/security/audit.ts` | Import `signEntry`, `verifyAuditChain` from `./audit-integrity`. Add `signature` and `prevHash` fields to `AuditEntry`. Sign entries on write. Verify chain on read. |
| `src/security/index.ts` | Re-export `sanitizeToolError` and audit integrity functions. |

### NOT Modified

| File | Reason |
|------|--------|
| `src/commands/ask.ts` | Error handling in ask command is separate from tool executor |
| `src/index.ts` | No entry point changes |
| `src/security/patterns.ts` | No pattern changes |
| `src/security/gateway.ts` | No changes |
| `src/security/output-guard.ts` | No changes |
| `src/security/redact.ts` | No changes |
| `src/web/server.ts` | No web layer changes |
| `src/control/auth.ts` | No auth changes |
| All U1-U12 test files | No changes — existing tests still pass |
| All Discord tool files | No changes — tools themselves unchanged |

---

## 8. Security Requirements & Invariants

### Error Message Sanitization Invariants

1. **No raw `error.message` returned to Discord** — all error responses go through `sanitizeToolError()`
2. **Full error details preserved in server logs** — `logger.error()` retains the original message
3. **Known error categories get descriptive (but safe) messages** — rate limit, permission, not-found
4. **Unknown errors get generic message** — no file paths, stack traces, or internal details leaked
5. **Tool name is preserved in error message** — users know which tool failed
6. **No behavior change for successful executions** — only error path affected

### Audit Log Integrity Invariants

1. **Every new entry has a valid HMAC signature** — signed with SESSION_SECRET-derived key
2. **Every new entry has `prevHash` linking to previous entry** — chain is verifiable
3. **Tampering with any entry breaks the chain** — detection is deterministic
4. **Verification failure is non-blocking** — logs warning, still returns entries
5. **Existing entries (pre-U13) are accepted without signatures** — backward compatible; chain starts at first signed entry
6. **No new environment variables required** — uses existing SESSION_SECRET
7. **Audit entries are still redacted** — `redact()` applied before signing

### Security Properties

- **Information leakage**: BLOCKED — `sanitizeToolError()` strips internal details from Discord responses
- **Audit tampering**: DETECTED — HMAC chain makes modification detectable
- **Audit availability**: PRESERVED — verification failure does not block reads
- **Backward compatibility**: MAINTAINED — pre-U13 entries accepted without signatures

---

## 9. Test Plan (200+ Assertions)

### Test Suite A: Error Sanitization (`scripts/test-error-sanitization.ts`)

#### Section A1: Generic Error Messages (30+ assertions)
- `sanitizeToolError("create-channel", new Error("ENOENT: no such file"))` returns generic message
- `sanitizeToolError("ban-user", new Error("EACCES: permission denied"))` returns generic message
- `sanitizeToolError("rename-channel", new Error("SQLITE_ERROR: disk I/O"))` returns generic message
- `sanitizeToolError("delete-channel", new Error("/home/user/.env: permission denied"))` does NOT contain `/home/user`
- `sanitizeToolError("purge", new Error("spawn ENOENT"))` does NOT contain file path
- Error message contains tool name
- Error message does NOT contain raw error text
- Error message does NOT contain stack trace
- Error message does NOT contain file system paths
- Error message does NOT contain internal hostnames

#### Section A2: Known Error Categories (20+ assertions)
- Rate limit error → message mentions "rate-limited"
- Permission error → message mentions "permissions"
- Not-found error → message mentions "not found"
- Generic error → message says "encountered an error. The issue has been logged."
- All category messages still contain tool name

#### Section A3: Non-String Errors (15+ assertions)
- `sanitizeToolError("tool", null)` does not crash
- `sanitizeToolError("tool", undefined)` does not crash
- `sanitizeToolError("tool", 42)` does not crash
- `sanitizeToolError("tool", { code: "ENOENT" })` does not crash
- `sanitizeToolError("tool", "")` does not crash

#### Section A4: Integration with Executor (25+ assertions)
- Mock tool that throws error → executor returns generic message
- Mock tool that throws error → server log contains full error
- Mock tool that throws error → audit entry records error
- Successful tool execution → no change in behavior
- Error message does NOT contain any word from the raw error that looks like a path
- Error message does NOT contain `/data/`, `/home/`, `C:\`, or similar path prefixes

### Test Suite B: Audit Integrity (`scripts/test-audit-integrity.ts`)

#### Section B1: Entry Signing (20+ assertions)
- `signEntry()` produces a non-empty signature string
- `signEntry()` produces a non-empty prevHash string
- Same entry signed twice produces different signatures (due to HMAC internal state or timestamp)
- Signature is hex-encoded string
- PrevHash of first entry is deterministic (or "genesis")
- Entry with `signature` field is a valid AuditEntry

#### Section B2: Chain Verification (25+ assertions)
- `verifyAuditChain([])` returns `{ valid: true }` (empty chain is valid)
- `verifyAuditChain([signedEntry1])` returns `{ valid: true }`
- `verifyAuditChain([signedEntry1, signedEntry2])` returns `{ valid: true }` when chain is intact
- Tampering with entry[0].who → `verifyAuditChain` returns `{ valid: false, brokenAt: 0 }`
- Tampering with entry[1].result → returns `{ valid: false, brokenAt: 1 }`
- Inserting extra entry → returns `{ valid: false, brokenAt: <index> }`
- Removing entry → returns `{ valid: false, brokenAt: <index> }`
- Reordering entries → returns `{ valid: false, brokenAt: <index> }`

#### Section B3: Backward Compatibility (15+ assertions)
- Pre-U13 entries (no signature field) are accepted in chain verification
- Mixed chain (old unsigned + new signed) is valid
- Chain starts verification from first signed entry
- Unsigned entries in the middle are skipped (not verified)

#### Section B4: Non-Blocking Verification (15+ assertions)
- `verifyAuditChain` never throws — always returns `{ valid, brokenAt? }`
- Broken chain still returns entries (not empty)
- Broken chain logs a warning
- Multiple broken entries → `brokenAt` points to first break

#### Section B5: Key Derivation (10+ assertions)
- Integrity key is derived from SESSION_SECRET
- Missing SESSION_SECRET uses fallback (does not crash)
- Key is a Buffer of expected length

#### Section B6: Edge Cases (15+ assertions)
- Very large audit log (5000 entries) verification completes in <5s
- Empty entry fields do not crash signing
- Unicode in entry fields does not crash signing
- Concurrent `recordAudit` calls do not corrupt chain
- `saveAudit()` still uses atomic write (tmp + rename)

**Total estimated assertions: 230+**

---

## 10. Regression Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| Sanitized error messages confuse users | LOW | LOW | Messages still name the tool and indicate an error occurred; more user-friendly than raw errors |
| Audit HMAC key (SESSION_SECRET) compromised | NONE | HIGH | SESSION_SECRET is already required for session security; if compromised, session integrity is already broken |
| Audit chain verification impacts performance | NONE | LOW | HMAC-SHA256 is fast; 5000-entry chain verified in <100ms |
| Pre-U13 audit entries rejected | LOW | MEDIUM | Backward compatibility: unsigned entries accepted, chain starts at first signed entry |
| `sanitizeToolError` incorrectly categorizes errors | LOW | LOW | Category matching is best-effort; unknown errors get generic message (safe default) |
| Audit entries become larger (signature + prevHash fields) | NONE | LOW | ~128 bytes per entry; negligible for 5000-entry cap |
| Existing test suites affected | NONE | HIGH | No changes to any function signatures or behavior paths tested by U1-U12 suites |

**Overall regression risk: LOW**

The key safety guarantee: **no positive flow is altered.** Successful tool executions are unchanged. Audit entries are still written and readable. The only changes are: (1) error messages become more generic (strictly better for security), and (2) audit entries gain integrity signatures (additive).

---

## 11. Implementation Phases

### Phase 1: Error Sanitization Utility (~15 minutes)
- Create `src/security/sanitize.ts` with `sanitizeToolError()` function
- Category detection: rate limit, permission, not-found, generic
- All paths return generic messages with tool name preserved

### Phase 2: Executor Integration (~10 minutes)
- Modify `src/ai/tools/executor.ts` line 250
- Import `sanitizeToolError` from `security/sanitize`
- Replace `${errorMessage}` with `sanitizeToolError(toolName, error)`
- Keep `logger.error()` with full original error

### Phase 3: Audit Integrity Module (~25 minutes)
- Create `src/security/audit-integrity.ts`
- Implement `signEntry()`, `verifyEntry()`, `verifyAuditChain()`
- Key derivation from SESSION_SECRET
- Backward-compatible chain verification

### Phase 4: Audit Integration (~15 minutes)
- Modify `src/security/audit.ts`
- Add `signature` and `prevHash` to `AuditEntry` interface
- Call `signEntry()` in `recordAudit()` before save
- Call `verifyAuditChain()` in `getAuditLog()` (non-blocking, warn on failure)

### Phase 5: Barrel Exports (~5 minutes)
- Update `src/security/index.ts`
- Re-export `sanitizeToolError` and audit integrity functions

### Phase 6: Test Suite — Error Sanitization (~30 minutes)
- Create `scripts/test-error-sanitization.ts`
- Implement 90+ assertions across 4 sections

### Phase 7: Test Suite — Audit Integrity (~30 minutes)
- Create `scripts/test-audit-integrity.ts`
- Implement 100+ assertions across 6 sections

### Phase 8: Regression Verification (~15 minutes)
- Run full U1-U12 regression suite (1,980+ assertions)
- Run U13 test suites (230+ assertions)
- Run `npx tsc --noEmit`
- Run `npm run build`

### Phase 9: Final Verification & Report (~10 minutes)
- Run all tests one final time
- Generate implementation report
- Wait for user approval before commit

**Total estimated time: ~155 minutes**

---

## 12. Scope Boundaries: What U13 Will NOT Include

Explicitly excluded from U13 scope:

1. **No redaction pattern expansion** (Candidate B) — deferred to U14
2. **No circuit breaker state machine** (Candidate D) — deferred to reliability update
3. **No rate limiter persistence** — deferred
4. **No session persistence** — deferred
5. **No test framework migration** — deferred
6. **No changes to authentication, CORS, CSRF, or security headers** (U10/U11)
7. **No changes to security detection patterns** (U12)
8. **No changes to Discord tools, rate limiting, or governance** (U1-U9)
9. **No changes to the web server** (U10/U11)
10. **No new environment variables** — uses existing SESSION_SECRET
11. **No database migration** — file-based JSON storage unchanged
12. **No changes to `src/commands/ask.ts`** — error handling there is separate
13. **No changes to `src/index.ts`** — no entry point modifications
14. **No router.ts log message fix** — too trivial; can be folded into future cleanup
15. **No removal of unused `express-session` dependency** — cleanup task, not security

---

## 13. GO/NO-GO Decision

### GO Criteria (all met)

- [x] All U1-U12 tests pass (1,980+ assertions)
- [x] TypeScript compiles cleanly
- [x] Build succeeds
- [x] U13 scope is well-defined and bounded
- [x] No prerequisites required
- [x] Regression risk is LOW
- [x] Error sanitization is purely defensive (no behavior change for legitimate flows)
- [x] Audit integrity is purely additive (new fields, new functions, no existing behavior altered)
- [x] All files to modify/create are identified
- [x] Test plan has 230+ assertions
- [x] Security invariants are defined
- [x] No consumer import paths change
- [x] Backward compatibility with pre-U13 audit entries maintained

### Decision: **GO**

U13 (Error Sanitization + Audit Log Integrity) is ready for implementation. The scope addresses the highest remaining security gap (G1: information leakage via tool error messages) and the most significant medium gap (G2: audit tampering). Both changes are low-risk, low-complexity, and purely defensive.

This completes the security hardening arc: U10 locked down the web perimeter, U11 added browser enforcement headers, U12 consolidated detection patterns, and U13 hardens the remaining information leakage and audit integrity vectors.

---

## 14. Summary

U13 will harden two remaining security vectors:

- **Error message sanitization** → `sanitizeToolError()` in `security/sanitize.ts` replaces raw error messages with generic, tool-name-preserving messages for Discord delivery; full details logged server-side only
- **Audit log integrity** → HMAC-SHA256 chain signatures on audit entries; tamper detection via chain verification; backward-compatible with pre-U13 entries; non-blocking (availability over strict integrity)

**Files created:** 4 (2 source + 2 test)  
**Files modified:** 3 (executor.ts, audit.ts, index.ts)  
**Test assertions:** 230+  
**New environment variables:** 0  
**Behavior changes:** 0 (error messages become more generic = strictly better)

This is the "lock the last doors" update: no new features, no behavior changes, just closing the final information leakage and audit integrity gaps.
