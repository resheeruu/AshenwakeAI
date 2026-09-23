# Changelog

All notable changes to AshenAI are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased] — 2026-09-22

### Security (Production Hardening)
- **Vision SSRF Fix**: `src/ai/vision.ts` now validates all image URLs through `validateOutboundUrl()` and `validateRedirectTarget()` from `src/security/network-boundary.ts`. Blocks localhost, loopback, private IPs, link-local, cloud metadata, credential-bearing URLs, and unsupported protocols. Enforces 10s timeout, 10MB max response size, image/* content-type, and redirect chain validation.
- **Credential Encryption Fail-Closed**: `src/ai/providers/platform/credential-store.ts` removed hardcoded `ashenai-dev-credential-key-v1` development fallback. `getCredentialKey()` now throws in ALL environments if `SESSION_SECRET` is missing or too short.
- **Debounced Session Persistence**: `src/control/session-store.ts` added `debouncedSave()` with 500ms batching window. `touchSession` uses debounced save instead of immediate disk write. `validateSession` only persists on expiration. Security-critical operations (`createSession`, `rotateSession`, `destroySession`, `revokeSession`) retain direct writes.
- **Trust Proxy Configurability**: `src/web/server.ts` changed `app.set("trust proxy", 1)` to read from `TRUST_PROXY` environment variable with fallback to 1.
- **Release Script Repository-Relative**: `scripts/release-check.sh` replaced hardcoded `~/AshenAI` with `ROOT_DIR` resolution. Changed `npm audit` from INFORMATIONAL to MANDATORY with `--omit=dev --audit-level=high`. Added `data/.test-rollback-repo/` to `.gitignore`.

### Added
- Custom anime emote system with text fallback (zero Unicode emoji policy)
- 32 anime actions across affection/combat/fun categories
- Anime action media providers with SSRF protection (HTTPS-only, private IP blocking)
- Per-action cooldowns and reply targeting for anime actions
- Dynamic help text for anime commands
- Credential encryption security tests (17/17)
- Docker HEALTHCHECK instruction
- `scripts/test-no-unicode-emojis.ts` — 8-file Unicode emoji regression scan
- `scripts/test-credential-encryption.ts` — AES-256-GCM encryption tests
- `scripts/release-check.sh` — 12-step production readiness gate
- `ASHENAI_CREDENTIAL_KEY` environment variable for credential encryption override

### Changed
- `/prompt` now registers as the AI-powered server builder (was `/build`)
- `/personality` now registers as the personality settings command (was `/prompt`)
- Help text and documentation updated to reflect command rename
- Tabler icons pinned to `@3.31.0` (was `@latest`)
- `anime-emotes.ts` `getAnimeEmotesByPrefix()` now derives from emote map (no duplication)
- Dockerfile upgraded to multi-stage build with `npm ci --omit=dev` and non-root user
- Pattern-router help text updated to list all 11 active commands

### Fixed
- Double-decryption bug in `connection-tester.ts` — `testProviderConnection()` and `discoverModels()` received already-decrypted values but tried to decrypt again
- Stale pattern-router help text (only listed 3 of 12 commands)
- Command naming confusion: `/prompt` was personality settings but code referenced it as builder
- Health endpoint sanitized (no git SHAs, provider names, shard details, update state)
- 9 duplicate provider routes removed from `server.ts`
- Graceful shutdown: HTTP server closes, user profiles flush, timers unref'd
- Backup path traversal fixed (strict ID validation, path containment)
- Commit hash validation added to `update-manager.ts`
- `.unref()` added to selfHeal, future-foundations, and scheduler timers

### Removed
- 10 dead command files: casino, hunt, adventure, profile, task, send, diagnose, config, game.clean-baseline, status.backup

### Security
- Provider credentials encrypted at rest with AES-256-GCM
- SSRF protection for configurable provider URLs (private IP blocking, protocol validation)
- Output guard blocks leaked secrets and internal config
- HMAC-SHA256 audit chain integrity
- Rate limiting per-user sliding window
- Role-based access control (owner > admin > moderator > member > guest)
- Risk engine with confirmation for medium+ operations

### Deployment
- Docker: multi-stage build, `npm ci --omit=dev`, non-root user, HEALTHCHECK
- `.dockerignore` excludes dev artifacts
- `SESSION_SECRET` required in production (min 16 chars)
- Health endpoint exposes only safe operational information
