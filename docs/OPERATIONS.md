# Operations, Release & CI Policy

## 1. Release lifecycle

```
feature branch → pull request → GitHub Actions (CORE) → merge main
   → version bump (package.json) + git tag → GitHub Release + CHANGELOG
   → deploy (Docker / scripts/deploy-update.sh) → smoke test → monitor
```

- `CHANGELOG.md` is updated at release time (not per commit).
- `npm run release:check` (`scripts/release-check.sh`) is the pre-release gate.
- Never tag or release from a dirty tree or a failing `npm test`.
- Version changes happen **only** on release, never as a side effect of
  unrelated work.

## 2. CI policy (`.github/workflows/ci.yml`)

Current enforced behavior (do not weaken):

- matrix: Node **22** and **24** (matches `"engines": { "node": ">=22" }`)
- `npm ci` → `typecheck` → `tsc-baseline-gate` → `build` → `npm test`
  (41 CORE suites, fail-fast)
- then `npm ls`, `npm audit --omit=dev --audit-level=high` (**blocking**:
  `exit 1` on any high/critical finding) and icon validation
  (`continue-on-error` — the only non-blocking step)

### Dependency audit policy

CI runs `npm audit --omit=dev --audit-level=high` and **fails the build** on
any high/critical finding (`.github/workflows/ci.yml`). The recommended
severity policy for releases is:

| Severity | Policy |
|---|---|
| **critical** | block release (fix or explicit documented exception) |
| **high** | block release unless explicitly accepted in the PR description |
| **moderate** | warning in the PR, fix opportunistically |
| **low** | informational |

Rationale: the dependency set is small (34 runtime deps) and `npm audit`
currently reports 0 vulnerabilities, so enforcing critical/high at release time
adds signal without noise. Note the audit filter (`--omit=dev`) currently
audits all 34 dependencies because the package has no `devDependencies`
section — the build toolchain ships as runtime dependencies.

## 3. Main branch protection (recommended exact settings)

Not applied automatically — apply via GitHub → Settings → Branches → `main`
(or `PUT /repos/resheeruu/AshenwakeAI/branches/main/protection`):

- Require a pull request before merging: **1** approval
- Require status checks to pass before merging:
  - `ci (22)`
  - `ci (24)`
- Require branches to be up to date before merging: **yes**
- Do not allow force pushes: **enabled**
- Do not allow deletions: **enabled**
- Require conversation resolution before merging: **enabled**
- Include administrators: **enabled** (so nobody bypasses it)

Those two check names are the exact GitHub Actions job names produced by the
matrix, so the required-checks list stays valid.

## 4. Production smoke test (credential-free part)

Run after every deploy; none of these require secrets:

```bash
node --version                     # must be >= 22
npm run typecheck
npm run build
npm test                           # 41/41 CORE
node dist/cli.js --help 2>/dev/null || true   # binary boots
```

Then start the app and verify, from the logs/response:

| Check | Where |
|---|---|
| process starts, config validation passes | startup logs |
| database opens + migrations applied | `📦 Running migration` lines / `schema_migrations` |
| provider discovery enumerates all registered providers | Preflight `provider:*` checks |
| credential-less providers report NOT_CONFIGURED | Preflight, not HEALTHY |
| health endpoint answers | `GET /api/health` |
| dashboard rejects unauthenticated access | `GET /api/...` without cookie → 401 |
| security headers present | response headers |
| Discord gateway connects (needs token) | startup logs |
| graceful shutdown on SIGTERM | Ctrl-C → clean exit |

### Live checklist (requires real credentials — do not commit them)

- [ ] `DISCORD_TOKEN` set → gateway Ready, slash commands registered
- [ ] at least one provider key set → `provider_keys` check flips to CONFIGURED
- [ ] one real AI request succeeds → provider becomes HEALTHY in Preflight
- [ ] owner can log into the dashboard, logout invalidates the session
- [ ] `npm audit --audit-level=high` clean at release time

## 5. Hosting / resource notes

Supported paths: Docker (`Dockerfile`), VPS, Termux, Render-style platforms.
Constraints to keep in mind:

- **RAM**: keep the heap headroom visible; the supervisor warns above 512 MB
  heap (`createSupervisorChecks`).
- **Native deps**: `better-sqlite3` and `esbuild` must build on the target
  (`allowScripts` in `package.json`) — CI uses `npm ci` for exactly this.
- **Disk**: `npm run diagnose:disk` for ENOSPC triage; runtime data lives under
  `data/` (gitignored).
- **Restart signals**: `SIGINT`/`SIGTERM` are handled by
  `gracefulShutdown` — platforms that send SIGKILL first will skip cleanup.
- **Health checks**: point the platform at `GET /api/health`.
- Do not reintroduce Lavalink/Shoukaku or other unused runtime dependencies.

## 6. Logging & observability

Structured pino logs with context (provider, tool, duration, success/failure).
Hard rules:

- never log: API keys, tokens, passwords, session secrets, auth headers;
- redaction happens **before** the log record is built
  (`src/security/redact.ts` → `redactLogMessage`);
- error categories are preserved (provider auth failure ≠ timeout ≠ SSRF
  block) so failover and self-healing can act on them.

## 7. Storage hygiene

Everything runtime-generated is gitignored: `data/` (DB, provider-health.json,
backups, logs), `dist/`, `.env*`, `node_modules/`. Verified: `git status`
stays clean after a full test run. Never commit `data/` artifacts or logs.
