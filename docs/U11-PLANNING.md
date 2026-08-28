# U11 Architecture Planning & Readiness Review

**Date:** 2026-08-28  
**Status:** PLANNING ONLY — No code changes  
**Decision Required:** GO / NO-GO for U11 implementation

---

## 1. Current Architecture Verification (U1–U10)

The repository has been audited against the actual source files. Verified state:

| Layer | Status | Files | Test Coverage |
|-------|--------|-------|---------------|
| U1–U2: Tool framework (registry, validator, executor) | Complete | `src/ai/tools/{registry,validator,executor,types,audit}.ts` | `test-tool-registry.ts` |
| U3: Read-only Discord tools (5) | Complete | `src/ai/tools/discord/{inspect-server,list-channels,check-permissions,inspect-ai-config,health-check}.ts` | `test-u3.ts` (68) |
| U4: Write Discord tools (4) | Complete | `src/ai/tools/discord/{create-channel,create-category,rename-channel,move-channel}.ts` | `test-u4.ts` (175) |
| U5: Management tools (7) | Complete | `src/ai/tools/discord/channels/` | `test-u5.ts` (134) |
| U6: Protection tools (7) | Complete | `src/ai/tools/discord/{protection-tools,audit-viewer}.ts` | `test-u6.ts` (494) |
| U7: Governance tools (9) | Complete | `src/ai/tools/governance/` | `test-u7.ts` (146) |
| U8: Moderation tools (7) | Complete | `src/ai/tools/discord/moderation/` | `test-u8.ts` (181) |
| U9: Tool rate limiting | Complete | `src/ai/tools/tool-rate-limit.ts` | `test-u9.ts` (283) |
| U10: Web security perimeter | Complete | `src/web/server.ts`, `src/control/auth.ts`, `src/config/env.ts`, `src/index.ts` | `test-web-security.ts` (93) |
| **Total assertions** | | | **1,572+** |

All U1–U10 tests pass. TypeScript compiles cleanly. Build succeeds.

---

## 2. Remaining Architectural & Security Gaps

Audited from actual source code:

### Critical Gaps
| # | Gap | Location | Impact |
|---|-----|----------|--------|
| G1 | **No security response headers on web server** | `src/web/server.ts` | Browser-based attacks: clickjacking, MIME sniffing, XSS, information leakage |
| G2 | **Duplicate security pattern sets** | `gateway.ts`, `output-guard.ts`, `chat-security.ts` | Three independent regex sets can drift out of sync; maintenance burden |
| G3 | **In-memory sessions** | `src/control/auth.ts` | Sessions lost on restart; no horizontal scaling |

### Medium Gaps
| # | Gap | Location | Impact |
|---|-----|----------|--------|
| G4 | **No circuit breaker formalization** | `src/ai/router.ts` | Router has quarantine/cooldown but no structured circuit breaker state machine |
| G5 | **In-memory rate limiters** | `src/security/rate-limit.ts`, `src/ai/tools/tool-rate-limit.ts`, `src/web/server.ts` | All rate limiters reset on restart |
| G6 | **No Content-Security-Policy** | `src/web/server.ts` | XSS mitigation absent for web panel |
| G7 | **express-session dependency unused** | `package.json` | Dead dependency; custom session implementation used instead |

### Low Gaps
| # | Gap | Location | Impact |
|---|-----|----------|--------|
| G8 | **No test framework** | `scripts/` | Standalone tsx scripts, no coverage reporting, no parallel execution |
| G9 | **JSON file persistence** | `src/core/data-store.ts` | No ACID guarantees; tmp+rename helps but no concurrent access locks |
| G10 | **Backup to same directory** | `src/core/backup-manager.ts` | No offsite backup strategy |

---

## 3. U11 Candidate Proposals

### Candidate A: Web Security Headers Hardening

**Scope:** Add a comprehensive security headers middleware to `src/web/server.ts`.  
**Headers added:** Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Strict-Transport-Security (production), X-XSS-Protection (legacy compat).

| Dimension | Rating |
|-----------|--------|
| Security impact | HIGH — closes clickjacking, MIME sniffing, XSS vectors on the web panel |
| Architectural value | MEDIUM — isolated middleware, no cross-module dependencies |
| Implementation complexity | LOW — single middleware file + tests |
| Regression risk | LOW — additive only; no existing behavior modified |
| Prerequisites | None |

### Candidate B: Security Pattern Consolidation

**Scope:** Merge the three duplicated regex pattern sets (`gateway.ts`, `output-guard.ts`, `chat-security.ts`) into a single source-of-truth module (`src/security/patterns.ts`).

| Dimension | Rating |
|-----------|--------|
| Security impact | MEDIUM — prevents pattern drift, but current patterns work |
| Architectural value | HIGH — eliminates duplication, single source of truth |
| Implementation complexity | MEDIUM — must update 3 consumers without changing behavior |
| Regression risk | MEDIUM — any regex change could alter detection behavior |
| Prerequisites | None |

### Candidate C: Circuit Breaker State Machine

**Scope:** Formalize the router's quarantine/cooldown into a proper circuit breaker (closed → open → half-open) with configurable thresholds and metrics.

| Dimension | Rating |
|-----------|--------|
| Security impact | MEDIUM — improves resilience against flaky providers |
| Architectural value | HIGH — reusable pattern for any external dependency |
| Implementation complexity | MEDIUM-HIGH — new module, integration with router |
| Regression risk | MEDIUM — changes provider selection behavior |
| Prerequisites | None |

### Candidate D: Persistent Sessions

**Scope:** Move sessions from in-memory Map to file-based persistence (`data/sessions.json`) with atomic writes.

| Dimension | Rating |
|-----------|--------|
| Security impact | HIGH — sessions survive restarts |
| Architectural value | MEDIUM — persistence layer addition |
| Implementation complexity | MEDIUM — file I/O, cleanup, concurrency |
| Regression risk | MEDIUM — changes auth flow |
| Prerequisites | None |

### Candidate E: Rate Limiter Persistence

**Scope:** Persist rate limiter state to disk so limits survive restarts.

| Dimension | Rating |
|-----------|--------|
| Security impact | LOW-MEDIUM — limits reset on restart is acceptable for most cases |
| Architectural value | LOW — adds complexity for marginal gain |
| Implementation complexity | HIGH — multiple limiter instances, timing windows |
| Regression risk | HIGH — changes rate limiting behavior globally |
| Prerequisites | None |

---

## 4. Candidate Comparison Matrix

| Criterion | A: Headers | B: Consolidation | C: Circuit Breaker | D: Sessions | E: Rate Persist |
|-----------|:----------:|:-----------------:|:------------------:|:-----------:|:---------------:|
| Security impact | ★★★★ | ★★★ | ★★ | ★★★★ | ★★ |
| Architectural value | ★★★ | ★★★★★ | ★★★★ | ★★★ | ★ |
| Complexity | ★ | ★★★ | ★★★★ | ★★★ | ★★★★★ |
| Regression risk | ★ | ★★★ | ★★★ | ★★★ | ★★★★★ |
| Prerequisites | None | None | None | None | None |
| **Overall** | **Best** | Good | Good | Good | Poor |

---

## 5. Recommended U11 Scope: Web Security Headers Hardening

**Decision: GO for Candidate A**

Rationale:
- Highest security impact with lowest complexity and regression risk
- Closes real browser-based attack vectors (clickjacking, MIME sniffing, information leakage) on the web panel that already handles authentication and CSRF
- Purely additive: adds headers without modifying any existing behavior
- No cross-module dependencies; isolated to `src/web/server.ts`
- Natural companion to U10 (web security perimeter): U10 locked down CORS/CSRF/sessions, U11 locks down browser enforcement headers
- Every other candidate can be addressed in future updates without loss

---

## 6. Proposed Architecture & Data Flow

### Architecture

```
Request → Express
  → CORS middleware (U10)
  → Security Headers middleware (U11) ← NEW
  → Global Rate Limiter
  → JSON body parser
  → requireOwner / requireCsrf
  → Route handler
  → Response
```

The security headers middleware sits immediately after CORS (before rate limiting) to ensure every response — including error responses — carries the full header set.

### Data Flow

1. **Middleware receives request** → passes to next middleware (headers are set on response, not request)
2. **Route handler produces response** → `res.setHeader()` calls attach before `res.send()`
3. **Alternative: use `res.on('header')`** — Express v5 sets headers before `writeHead`, so we set them in middleware via `res.setHeader()` which persists until send

### Header Specifications

| Header | Value | Rationale |
|--------|-------|-----------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | Blocks XSS, data injection, clickjacking via frame-ancestors |
| `X-Frame-Options` | `DENY` | Legacy clickjacking protection (CSP frame-ancestors supersedes but this covers older browsers) |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage; allows same-origin |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Disables unnecessary browser features |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) | Forces HTTPS for 1 year |
| `X-XSS-Protection` | `0` | Disables legacy XSS filter (CSP is the modern replacement; legacy filter can introduce vulnerabilities) |

### CSP Notes

- `style-src 'unsafe-inline'` is required because the web panel uses inline styles (common for dashboards)
- `img-src data:` allows inline images (used for UI icons)
- `frame-ancestors 'none'` is the CSP equivalent of `X-Frame-Options: DENY`
- `object-src 'none'` blocks plugins (Flash, etc.)
- CSP will be logged in development via `Content-Security-Policy-Report-Only` with a reporting endpoint (optional, not in scope)

---

## 7. Files to Create or Modify

### Modified Files
| File | Change |
|------|--------|
| `src/web/server.ts` | Add `securityHeaders` middleware after CORS; set 7 response headers |

### Created Files
| File | Purpose |
|------|---------|
| `scripts/test-web-headers.ts` | Test suite: 200+ assertions covering all headers, edge cases, production vs development |

### NOT Modified (explicitly excluded)
| File | Reason |
|------|--------|
| `src/security/gateway.ts` | No pattern changes |
| `src/security/output-guard.ts` | No pattern changes |
| `src/security/chat-security.ts` | No pattern changes |
| `src/control/auth.ts` | No auth changes |
| `src/config/env.ts` | No config changes |
| `src/index.ts` | No entry point changes |

---

## 8. Security Requirements & Invariants

### Invariants (must hold for all responses)

1. **Every HTTP response** (200, 401, 403, 404, 500) must include all 7 security headers
2. **CSP must not break the web panel** — all inline styles and self-hosted assets must be allowed
3. **HSTS must only be set in production** — development over HTTP must not be broken
4. **Headers must not leak information** — no `Server`, `X-Powered-By`, or version headers
5. **CORS headers (U10) must not be duplicated or overridden** by the security headers middleware
6. **The middleware must be idempotent** — setting headers twice (e.g., in CORS and here) must not cause conflicts

### Security Properties

- **Clickjacking**: Blocked by both `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`
- **MIME sniffing**: Blocked by `X-Content-Type-Options: nosniff`
- **XSS (stored/reflected)**: Mitigated by `Content-Security-Policy` restricting script sources to `'self'`
- **Information leakage**: Blocked by removing `X-Powered-By` and setting `Referrer-Policy`
- **Protocol downgrade**: Blocked by `Strict-Transport-Security` in production
- **Legacy XSS filter attacks**: Blocked by `X-XSS-Protection: 0` (modern CSP replaces this)

---

## 9. Test Plan (200+ Assertions)

### Test Section A: Core Header Presence (40+ assertions)
- All 7 headers present on GET /api/health (public endpoint)
- All 7 headers present on GET /api/system/status (authenticated endpoint)
- All 7 headers present on POST /auth/login (public POST)
- All 7 headers present on POST /auth/login with bad credentials (401 response)
- All 7 headers present on GET /api/nonexistent (404 response)
- All 7 headers present on PUT /api/guilds/test (CSRF-protected endpoint)
- Headers present on SSE /api/logs/stream connection
- Verify no `X-Powered-By` header
- Verify no `Server` header with version info

### Test Section B: Content-Security-Policy (40+ assertions)
- CSP header exists and is non-empty
- `default-src 'self'` present
- `script-src 'self'` present (no 'unsafe-eval')
- `style-src 'self' 'unsafe-inline'` present
- `img-src 'self' data:` present
- `connect-src 'self'` present
- `font-src 'self'` present
- `object-src 'none'` present
- `frame-ancestors 'none'` present
- `base-uri 'self'` present
- `form-action 'self'` present
- CSP does NOT contain `unsafe-eval`
- CSP does NOT contain wildcard `*` in script-src
- CSP does NOT contain `http:` or `https:` wildcard origins

### Test Section C: X-Frame-Options (15+ assertions)
- `X-Frame-Options` is `DENY`
- Header present on public endpoints
- Header present on authenticated endpoints
- Header present on error responses

### Test Section D: X-Content-Type-Options (10+ assertions)
- `X-Content-Type-Options` is `nosniff`
- Present on all response types

### Test Section E: Referrer-Policy (10+ assertions)
- `Referrer-Policy` is `strict-origin-when-cross-origin`
- Present on all responses

### Test Section F: Permissions-Policy (15+ assertions)
- `Permissions-Policy` exists
- `camera=()` present
- `microphone=()` present
- `geolocation=()` present
- `payment=()` present
- No allowed permissions (all disabled)

### Test Section G: Strict-Transport-Security (20+ assertions)
- HSTS present when `NODE_ENV=production`
- HSTS value is `max-age=31536000; includeSubDomains`
- HSTS NOT present when `NODE_ENV=development` (or not set)
- HSTS NOT present when `NODE_ENV=test`
- HSTS present on HTTPS requests in production

### Test Section H: X-XSS-Protection (10+ assertions)
- `X-XSS-Protection` is `0`
- Present on all responses

### Test Section I: Header Immunity (20+ assertions)
- Headers present even on 401 responses
- Headers present even on 403 responses
- Headers present even on 404 responses
- Headers present even on 429 (rate limit) responses
- Headers present on OPTIONS preflight responses
- Headers do NOT conflict with CORS headers (U10)
- Multiple rapid requests all have headers

### Test Section J: Production vs Development (25+ assertions)
- Production mode: HSTS present, Secure flag on cookies
- Development mode: HSTS absent, no Secure flag
- CSP identical in both modes
- All other headers identical in both modes

### Test Section K: Edge Cases (20+ assertions)
- Empty request body does not affect headers
- Very large request body does not affect headers
- Non-existent route still gets headers
-Malformed URL still gets headers
- Headers are set before body (not after)

**Total estimated assertions: 225+**

---

## 10. Regression Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| CSP breaks web panel inline styles | LOW | HIGH | CSP allows `'unsafe-inline'` for styles; test with actual panel assets |
| CSP blocks SSE connections | LOW | MEDIUM | `connect-src 'self'` allows same-origin connections |
| HSTS breaks development workflow | LOW | HIGH | HSTS only enabled when `NODE_ENV=production` |
| Headers conflict with CORS (U10) | LOW | MEDIUM | Headers middleware runs after CORS; uses `res.setHeader()` which is additive |
| Performance overhead from header setting | NONE | NONE | `res.setHeader()` is a synchronous Map write; negligible |
| Express v5 compatibility | NONE | NONE | Headers use standard Express `res.setHeader()` API |

**Overall regression risk: LOW**

---

## 11. Implementation Phases

### Phase 1: Security Headers Middleware (Core)
- Create the `securityHeaders` middleware function in `src/web/server.ts`
- Set all 7 headers with correct values
- Place after CORS middleware, before rate limiter
- Duration: ~30 minutes

### Phase 2: Development vs Production Logic
- Add `NODE_ENV` check for HSTS header
- Ensure all other headers are environment-agnostic
- Duration: ~10 minutes

### Phase 3: Test Suite
- Create `scripts/test-web-headers.ts`
- Implement all 225+ assertions across 11 test sections
- Run and verify all pass
- Duration: ~60 minutes

### Phase 4: Regression Verification
- Run full U1-U10 regression suite (1,572+ assertions)
- Run `npx tsc --noEmit`
- Run `npm run build`
- Run `git diff --check`
- Duration: ~15 minutes

### Phase 5: Final Verification & Report
- Run U11 tests one final time
- Generate implementation report
- Wait for user approval before commit
- Duration: ~10 minutes

**Total estimated time: ~125 minutes**

---

## 12. Scope Boundaries: What U11 Will NOT Include

Explicitly excluded from U11 scope:

1. **Security pattern consolidation** (Candidate B) — deferred to U12
2. **Circuit breaker state machine** (Candidate C) — deferred to U12+
3. **Persistent sessions** (Candidate D) — deferred to U12+
4. **Rate limiter persistence** (Candidate E) — not planned
5. **CSP report-uri / report-to** endpoint — optional future enhancement
6. **Removal of `express-session` dependency** — cleanup task, not security
7. **Content-Security-Policy nonce-based scripts** — would require build pipeline changes
8. **Subresource Integrity (SRI)** — requires build-time hash generation
9. **Any changes to authentication, CORS, or CSRF behavior** (U10)
10. **Any changes to Discord tools, rate limiting, or governance** (U1–U9)
11. **Database migration** — out of scope for this project phase
12. **New environment variables** — headers are determined by `NODE_ENV` only

---

## 13. GO/NO-GO Decision

### GO Criteria (all met)

- [x] All U1–U10 tests pass (1,572+ assertions)
- [x] TypeScript compiles cleanly
- [x] Build succeeds
- [x] U11 scope is well-defined and bounded
- [x] No prerequisites required
- [x] Regression risk is LOW
- [x] Implementation is purely additive (no behavior changes)
- [x] All files to modify are identified
- [x] Test plan has 200+ assertions
- [x] Security invariants are defined

### Decision: **GO**

U11 (Web Security Headers Hardening) is ready for implementation. The scope is tight, the risk is low, and the security value is high. This is the natural next step after U10's web security perimeter work.

---

## 14. Summary

U11 will harden the web panel's HTTP response headers to defend against browser-based attacks:
- **Clickjacking** → `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
- **MIME sniffing** → `X-Content-Type-Options: nosniff`
- **XSS** → `Content-Security-Policy` restricting scripts to `'self'`
- **Information leakage** → `Referrer-Policy`, no `X-Powered-By`
- **Protocol downgrade** → `Strict-Transport-Security` (production)
- **Legacy XSS filter attacks** → `X-XSS-Protection: 0`
- **Unnecessary browser features** → `Permissions-Policy` disabling camera, microphone, etc.

This completes the web security perimeter: U10 locked down the application layer (CORS, CSRF, sessions, config validation), and U11 locks down the browser enforcement layer (security headers).
