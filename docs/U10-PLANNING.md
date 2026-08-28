# U10 Architecture Planning & Readiness Review

**Date:** 2026-08-28
**Status:** PLANNING — Awaiting Approval
**Depends on:** U9 (Tool Rate Limiting) — committed at `5f0e132`

---

## 1. Current State: U1-U9 Verified Architecture

| Unit | Scope | Status | Files |
|------|-------|--------|-------|
| U1 | Tool Registry + Execution Pipeline | COMPLETE | registry.ts, executor.ts, validator.ts, audit.ts, types.ts |
| U2 | Channel Scoping (per-guild) | COMPLETE | channel-scope.ts |
| U3 | Read-Only Discord Tools | COMPLETE | 5 tools (inspect, list, check, health, config) |
| U4 | Write Discord Tools | COMPLETE | 4 tools (create channel/category, rename, move) |
| U5 | Management Discord Tools | COMPLETE | 4 tools (edit, delete channel/category, permissions) + confirmation handler |
| U6 | Protection + Presets + Audit | COMPLETE | 7 tools (protect/unprotect, presets, audit viewer) |
| U7 | Governance & Policy Engine | COMPLETE | 9 tools (policy CRUD, templates, drift, remediation) |
| U8 | Moderation Tools | COMPLETE | 7 tools (warn, timeout, kick, ban, purge, view warnings) |
| U9 | Tool Rate Limiting | COMPLETE | ToolRateLimiter (global + per-tool, reservation system, fail-open/closed) |

**Total tool count:** 36 registered tools across 7 categories
**Total framework lines:** ~10,250 (src/ai/tools/) + ~1,268 (src/security/)
**Test assertions (U1-U9):** 1,572+ across 15 test suites — all passing

---

## 2. Highest-Priority Architectural Gaps

### Critical (Security)

| # | Gap | Risk | Current State |
|---|-----|------|---------------|
| C1 | **CORS wide open** | Any origin can call any API endpoint | `Access-Control-Allow-Origin: *` on all routes |
| C2 | **No CSRF protection** | Cross-site request forgery on state-changing endpoints | Session-based auth but no CSRF tokens |
| C3 | **No startup config validation** | Missing env vars cause runtime crashes | `.env` loaded without required-key checks |
| C4 | **Security pattern duplication** | Maintenance burden, inconsistency risk | `gateway.ts`, `output-guard.ts`, `chat-security.ts` overlap significantly |

### High (Reliability)

| # | Gap | Risk | Current State |
|---|-----|------|---------------|
| H1 | **No circuit breaker for external services** | Slow-failing provider blocks pipeline | Provider health is check-based, no breaker state machine |
| H2 | **Sessions not persisted** | Server restart kills all sessions | In-memory session store only |
| H3 | **Audit log has no integrity protection** | Tamperable plain JSON files | `data/audit-log.json` and `data/tool-audit.json` are raw JSON |

### Medium (Architecture)

| # | Gap | Risk | Current State |
|---|-----|------|---------------|
| M1 | **No test framework** | No coverage reporting, no isolation, no CI | Standalone tsx scripts |
| M2 | **No configuration schema validation** | Silent misconfigurations | Manual env var reading |
| M3 | **Rate limiter in-memory only** | Resets on restart | `UserRateLimiter` and `ToolRateLimiter` are Map-based |

---

## 3. U10 Candidate Comparison

### Candidate A: Web Security Perimeter Hardening

| Dimension | Assessment |
|-----------|------------|
| **Scope** | CORS lockdown, CSRF tokens, startup config validation, session cookie hardening |
| **Security Impact** | **CRITICAL** — Closes the 2 most exploitable web API vulnerabilities |
| **Architectural Value** | HIGH — Establishes security-first pattern for all future web features |
| **Complexity** | LOW-MEDIUM — Well-understood patterns, no new dependencies |
| **Regression Risk** | LOW — Web server is isolated from Discord tool pipeline |
| **Prerequisites** | None |
| **Files Affected** | `src/web/server.ts`, `src/control/auth.ts` (new middleware), `src/config/env.ts` |
| **Test Coverage** | New test script: `scripts/test-web-security.ts` |

### Candidate B: Circuit Breaker for External Services

| Dimension | Assessment |
|-----------|------------|
| **Scope** | State machine (closed → open → half-open) for AI providers and Discord API calls |
| **Security Impact** | MEDIUM — Prevents denial-of-service from slow providers |
| **Architectural Value** | HIGH — Critical reliability pattern for production |
| **Complexity** | MEDIUM — New state machine, integration with provider registry |
| **Regression Risk** | MEDIUM — Touches provider selection path used by every AI request |
| **Prerequisites** | None |
| **Files Affected** | New `src/ai/circuit-breaker.ts`, `src/ai/providers/registry.ts`, `src/ai/router.ts` |
| **Test Coverage** | New test script: `scripts/test-circuit-breaker.ts` |

### Candidate C: Security Module Consolidation

| Dimension | Assessment |
|-----------|------------|
| **Scope** | Merge overlapping pattern sets from gateway.ts, output-guard.ts, chat-security.ts into unified `security-perimeter.ts` |
| **Security Impact** | MEDIUM — Eliminates gaps between overlapping modules |
| **Architectural Value** | HIGH — Reduces duplication, single source of truth for patterns |
| **Complexity** | MEDIUM — Requires updating all import sites |
| **Regression Risk** | HIGH — Touches every security boundary in the system |
| **Prerequisites** | None |
| **Files Affected** | `src/security/gateway.ts`, `src/security/output-guard.ts`, `src/security/chat-security.ts`, new `src/security/perimeter.ts`, all consumers |
| **Test Coverage** | Refactor existing `scripts/test-security.ts` |

### Candidate D: Audit Log Integrity

| Dimension | Assessment |
|-----------|------------|
| **Scope** | HMAC signing of audit entries, tamper detection on read, chain verification |
| **Security Impact** | HIGH — Ensures audit trail cannot be silently modified |
| **Architectural Value** | MEDIUM — Important for compliance but narrow scope |
| **Complexity** | LOW — Additive change, no existing behavior altered |
| **Regression Risk** | LOW — Audit is write-once, read-rarely |
| **Prerequisites** | None |
| **Files Affected** | `src/security/audit.ts`, `src/ai/tools/audit.ts`, new `src/security/audit-integrity.ts` |
| **Test Coverage** | New test script: `scripts/test-audit-integrity.ts` |

### Candidate E: Test Infrastructure Modernization

| Dimension | Assessment |
|-----------|------------|
| **Scope** | Migrate to vitest, add coverage reporting, CI integration, isolated test environments |
| **Security Impact** | LOW — Indirect (better testing prevents regressions) |
| **Architectural Value** | VERY HIGH — Enables safe future development |
| **Complexity** | HIGH — Rewriting all 15 test suites, adding vitest dependency |
| **Regression Risk** | MEDIUM — Test rewrite could miss edge cases |
| **Prerequisites** | None |
| **Files Affected** | All `scripts/test-*.ts` files, `package.json`, new `vitest.config.ts` |
| **Test Coverage** | Meta — improves all test coverage |

---

## 4. Recommendation: U10 = Web Security Perimeter Hardening

### Why Candidate A

1. **Most critical vulnerability**: CORS `*` means any website can call `/api/actions/execute` if the user has an active session. This is a real, exploitable CSRF vulnerability today.
2. **Lowest risk**: Web server changes are isolated from the Discord tool pipeline (U1-U9).
3. **No dependencies**: Can be implemented immediately without waiting for other changes.
4. **Establishes pattern**: Security-first approach for all future web features.
5. **Quick validation**: New test script can verify all security headers and behaviors.
6. **Does not touch U1-U9**: Zero regression risk to the 1,572+ passing assertions.

### Why NOT the others

| Candidate | Reason for deferral |
|-----------|-------------------|
| B (Circuit Breaker) | Important but not exploitable today; providers fail fast (timeout), not slow |
| C (Consolidation) | High regression risk; current overlap is redundant, not broken |
| D (Audit Integrity) | Important but lower urgency than the CORS/CSRF vulnerability |
| E (Test Framework) | Huge scope; better done as U11-U12 after security is locked down |

---

## 5. Proposed U10 Architecture

### 5.1 CORS Lockdown

**Current:**
```typescript
res.setHeader("Access-Control-Allow-Origin", "*");
```

**Proposed:**
```typescript
const ALLOWED_ORIGINS = (process.env.ASHENAI_CORS_ORIGINS || "").split(",").filter(Boolean);
// If no origins configured: block all cross-origin requests
// If origins configured: only allow those specific origins
```

**Behavior:**
- Default: `Access-Control-Allow-Origin` not set (blocks all cross-origin)
- Configurable via `ASHENAI_CORS_ORIGINS` env var (comma-separated list)
- `Access-Control-Allow-Methods`: restricted to `GET, POST, OPTIONS` (no PUT needed for most endpoints)
- `Access-Control-Allow-Headers`: restricted to `Content-Type`
- `Access-Control-Allow-Credentials`: `true` (needed for session cookies)
- `Access-Control-Max-Age`: `86400` (cache preflight for 24h)

### 5.2 CSRF Token Protection

**New middleware:** `csrfProtection(req, res, next)`

**Mechanism:**
1. On login (`POST /auth/login`), generate a random CSRF token and include it in the response body
2. Client stores token in JavaScript variable (not cookie)
3. On every state-changing request (`POST`, `PUT`), client sends token in `X-CSRF-Token` header
4. Server validates token matches session's stored token
5. GET requests are exempt (safe methods)

**Token storage:** Added to `OwnerSession` interface:
```typescript
interface OwnerSession {
  // ...existing fields...
  csrfToken: string;
}
```

**Token lifecycle:**
- Generated at login
- Regenerated on session rotation (if implemented)
- Destroyed on logout
- Validated on every mutating request

### 5.3 Session Cookie Hardening

**Current:**
```
HttpOnly; SameSite=Lax; Max-Age=86400
```

**Proposed:**
```
HttpOnly; SameSite=Strict; Secure (in production); Max-Age=86400
```

Changes:
- `SameSite=Lax` → `SameSite=Strict` (blocks all cross-site cookie sending)
- Add `Secure` flag in production (HTTPS only)
- Add session rotation: after 1 hour, issue new session ID (prevents session fixation)

### 5.4 Startup Configuration Validation

**New module:** `src/config/validate.ts`

**Required environment variables (validated at startup):**
```
ASHENAI_OWNER_USERNAME
ASHENAI_OWNER_PASSWORD_HASH
ASHENAI_OWNER_PASSWORD_SALT
```

**Optional environment variables (warned if missing):**
```
ASHENAI_CORS_ORIGINS
PORT / WEB_PORT
```

**Behavior:**
- On server start, validate all required env vars exist and are non-empty
- If any required var is missing: log FATAL error and exit process
- If optional var is missing: log WARN with default behavior explanation
- Never log env var values (security)

### 5.5 Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/web/server.ts` | MODIFY | Replace CORS middleware, add CSRF validation middleware, add session rotation |
| `src/control/auth.ts` | MODIFY | Add `csrfToken` to session, generate on login, validate on requests, rotate sessions |
| `src/config/env.ts` | MODIFY OR NEW | Add `validateStartupConfig()` function |
| `src/index.ts` | MODIFY | Call `validateStartupConfig()` before starting services |
| `scripts/test-web-security.ts` | NEW | Comprehensive security header and behavior tests |

### 5.6 Security Requirements

| Requirement | Verification |
|-------------|-------------|
| CORS blocks all origins by default | Test: request from `http://evil.com` → blocked |
| CORS allows configured origins | Test: request from allowed origin → passed |
| CSRF token required on POST/PUT | Test: POST without token → 403 |
| CSRF token validated against session | Test: wrong token → 403 |
| GET requests exempt from CSRF | Test: GET without token → 200 |
| Session cookie is HttpOnly | Test: cookie header inspection |
| Session cookie is SameSite=Strict | Test: cookie header inspection |
| Session cookie is Secure in production | Test: NODE_ENV=production → Secure flag |
| Startup fails on missing required config | Test: unset ASHENAI_OWNER_USERNAME → process exits |
| Startup warns on missing optional config | Test: unset ASHENAI_CORS_ORIGINS → WARN logged |
| No secrets in logs | Test: env values not in output |

### 5.7 Test Plan

**New test script:** `scripts/test-web-security.ts`

**Test categories (target: 80+ assertions):**

| Section | Tests | Coverage |
|---------|-------|----------|
| A. CORS Default Behavior | 8 | Blocks all origins when unconfigured |
| B. CORS Allowed Origins | 10 | Allows configured origins, blocks others |
| C. CSRF Token Generation | 6 | Token generated at login, included in response |
| D. CSRF Token Validation | 12 | POST/PUT require token, GET exempt, wrong token rejected |
| E. Session Cookie Security | 10 | HttpOnly, SameSite, Secure flags |
| F. Session Rotation | 8 | Old session invalidated after rotation window |
| G. Startup Config Validation | 12 | Required vars checked, missing = FATAL, optional = WARN |
| H. Security Headers | 6 | No X-Powered-By, Content-Type options, etc. |
| I. Integration with Existing Auth | 8 | Login flow, logout, session lifecycle |
| J. Edge Cases | 10 | Empty cookies, malformed tokens, expired sessions |

### 5.8 Regression Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CORS change breaks web UI | LOW | HIGH | Test with local dev origin; configurable via env |
| CSRF token breaks existing clients | LOW | MEDIUM | CSRF only enforced on POST/PUT; GET unaffected |
| Session rotation disrupts active users | LOW | MEDIUM | Rotation window is 1 hour; old session valid during grace period |
| Config validation prevents startup | LOW | HIGH | Only fail on truly required vars (auth credentials) |
| Performance impact from CSRF checks | VERY LOW | LOW | Single string comparison per request |

### 5.9 Implementation Phases

| Phase | Scope | Estimated Effort |
|-------|-------|-----------------|
| **Phase 1: CORS Lockdown** | Replace wildcard CORS with configurable origin allowlist | Small |
| **Phase 2: CSRF Protection** | Generate tokens at login, validate on mutations, new middleware | Medium |
| **Phase 3: Session Hardening** | SameSite=Strict, Secure flag, session rotation | Small |
| **Phase 4: Config Validation** | Startup validation with FATAL/WARN levels | Small |
| **Phase 5: Tests** | Write `test-web-security.ts` with 80+ assertions | Medium |
| **Phase 6: Regression Run** | Full U1-U9 suite + new U10 tests | Automatic |

---

## 6. Changes to Existing Systems

| System | Change | Risk |
|--------|--------|------|
| `src/web/server.ts` | CORS middleware replaced, CSRF middleware added | LOW — web server is isolated |
| `src/control/auth.ts` | Session interface expanded, CSRF token lifecycle | LOW — additive, existing auth flow preserved |
| `src/config/env.ts` | New validation function | LOW — new code, no existing behavior changed |
| `src/index.ts` | Add startup validation call | LOW — one-line addition before server start |
| U1-U9 tool pipeline | **NO CHANGES** | NONE |
| Discord interaction system | **NO CHANGES** | NONE |
| AI provider system | **NO CHANGES** | NONE |
| Security modules (gateway, output-guard, chat-security, redact) | **NO CHANGES** | NONE |

---

## 7. GO / NO-GO Decision

### GO Criteria

| Criterion | Status |
|-----------|--------|
| U9 committed and verified | YES — `5f0e132` |
| U1-U9 regression suite passes | YES — 15/15 suites, 1,572+ assertions |
| Type check passes | YES — `npx tsc --noEmit` clean |
| Build succeeds | YES — `npm run build` clean |
| Working tree clean | YES — no uncommitted changes |
| No dependency on uncommitted work | YES — fully self-contained |
| Changes isolated to web layer | YES — zero U1-U9 files modified |
| Test plan defined | YES — 80+ assertions across 10 sections |
| Regression risks assessed | YES — all LOW |

### Decision

**GO** — U10 Web Security Perimeter Hardening is approved to proceed.

### Scope Boundary

**IN SCOPE:**
- CORS lockdown (configurable origin allowlist)
- CSRF token protection (login → header → validate)
- Session cookie hardening (SameSite, Secure, rotation)
- Startup configuration validation
- New test script with 80+ assertions

**OUT OF SCOPE:**
- Circuit breaker (defer to U11)
- Security module consolidation (defer to U12)
- Audit log integrity (defer to U13)
- Test framework migration (defer to U14+)
- Any changes to U1-U9 code
- Any changes to Discord interaction pipeline
- Any changes to AI provider system

---

*This document is a planning/readiness review only. No source files have been modified.*
