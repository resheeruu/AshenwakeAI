# Security Boundaries

> Verified against the code on `2ef0a77`. This describes enforced behavior,
> not intentions. Anything marked **recommendation** is not yet implemented.

## 1. Trust model in one paragraph

Three actors interact with the system: **anonymous network clients** (web/API),
**Discord users** (owner/admin/guest roles), and the **AI model** (which can
propose tool calls). The AI is treated as an untrusted caller: every tool
proposal passes through validation → permission → risk → rate limit →
confirmation → execution → audit (`src/ai/tools/executor.ts`). Secrets never
leave the process: they are redacted before logging (`src/security/redact.ts`)
and blocked from file reads (`src/security/tool-permissions.ts`).

## 2. Capability matrix (AI → tools)

Tools declare their own metadata (`src/ai/tools/*/index.ts`):
`requiredRole`, `requiredDiscordPermissions`, `riskLevel`,
`confirmationRequired`, `allowedScopes`.

| Capability | AI | User (Discord) | Permission gate | Risk | Confirmation | Network | Filesystem |
|---|---|---|---|---|---|---|---|
| Read conversation/memory | yes | yes | role + channel scope | safe | no | no | no |
| Moderation (warn/timeout/kick/ban) | yes | yes | Discord perm + role | medium/high | yes (23 tools) | no | no |
| Channel/role administration | yes | admin cmds | `ManageGuild`-class | high | yes | no | no |
| File read/write inside project | agent/fix only | no | `tool-permissions.ts` (`canReadPath`/`canWritePath`) | high | yes | no | yes (project root only) |
| Shell/command execution | agent/fix only | no | `tool-permissions.ts` + command allowlist | critical | yes | no | no |
| Web fetch / browse | yes | yes | URL boundary (§4) | medium | no | yes | no |
| MCP tools | conditional | conditional | MCP trust boundary (§3) | per-tool | if destructive | yes | varies |
| Provider add/update/delete | owner dashboard only | owner | `requireAuth` + owner role + CSRF | critical | yes | yes | no |
| Configuration changes | no | admin/owner | `ManageGuild` / owner + CSRF | high | yes | no | no |
| Database operations | no direct SQL tool | via app code | n/a | n/a | n/a | no | no |
| Self-update / rollback | **no** | operator only | no HTTP or AI trigger exists (§5) | critical | background only | yes | repo |

Key invariants enforced in `src/ai/tools/executor.ts`:

1. permission/scope validation runs **before** any execution,
2. tools can be dry-run (plan-only) with no side effects,
3. rate limits are consumed even when a confirmation is pending,
4. `recordToolAudit` runs for every outcome, including confirmation prompts.

`tool-permissions.ts` blocks secret paths (`.env*`, `*password*`,
`*private_key*`, `secrets/`, …) for read **and** write regardless of role.

## 3. MCP trust boundary

`src/ai/mcp-client.ts` registers MCP servers, then **filters** them:

- tool name validation, description sanitization, input-schema validation
  before a tool is ever exposed (`validateTool`);
- destructive verbs (`delete`, `ban`, `kill`, …) classified `DESTRUCTIVE` and
  routed through the same confirmation path as native tools;
- bounded timeouts, response sizes, tool counts and schema sizes;
- instruction-injection patterns in MCP output are redacted before the model
  sees them; logs pass through secret redaction.

Registering an MCP server does **not** grant the model unrestricted
capabilities: discovery → validation → risk classification still applies.

**Recommendation:** pin an explicit MCP server allowlist in config (server
configuration is currently data-driven) so operators can see what is trusted.

## 4. Web retrieval / SSRF

Single implementation: `src/security/network-boundary.ts` (pure, no DNS), used
by `src/web/fetch.ts`, `src/ai/providers/platform/connection-tester.ts`, and
`src/games/anime-actions/media-security.ts`.

- protocol allowlist: `http:`/`https:` only (media requires `https:`);
- blocked hostnames: `localhost`, `0.0.0.0`, `::`, `::1`, `*.local`,
  `*.internal`, `*.localhost`, `*.home.arpa`, cloud metadata names;
- blocked IP ranges compared **numerically** (loopback, RFC1918, CGNAT,
  link-local/metadata, multicast, reserved 240/4) plus IPv6 ULA/link-local/
  multicast and IPv4-mapped/NAT64/6to4 embeddings;
- URL credentials (`user:pass@`) rejected;
- `new URL()` normalization relied upon, so `127.1`, `0x7f.1` and decimal IPv4
  notations are normalized before the IP check;
- **every redirect hop** validated (`redirect: "manual"` +
  `validateRedirectTarget`, max 5 hops) plus per-hop DNS re-validation;
- DNS resolved and **all** resolved addresses checked before connecting;
  DNS failure is fail-closed;
- 5 MB response cap, robots.txt honored, 15 s timeout.

Regression coverage: `scripts/test-web-security.ts` section K, which also
asserts `fetch.ts` no longer uses automatic redirect following.

## 5. Process execution

Every `child_process` call site uses `execFile`/`spawn` with an argv array —
**no `shell: true` anywhere** (verified by repository scan).

| Call site | Executable | Purpose |
|---|---|---|
| `src/agent/tools.ts` | allowlisted commands, cwd pinned to project root, 120 s timeout, 10 MB buffer | agent task execution |
| `src/agent/supervisor/supervisor.ts` | fixed argv | supervisor checks |
| `src/coding-agents/coordinator.ts` / `cli-agent.ts` | registered coding agents | external agents |
| `src/core/update-manager.ts` | `git`, `node`, `npm` (fixed argv, timeouts) | background update/rollback |
| `src/web/server.ts` | `git rev-parse` (read-only) | version display |
| `src/cli.ts` | `npx tsx src/index.ts` | local launcher |

Secret-file access from these paths is rejected by `isSecretPath()`.

## 6. Dashboard authentication & sessions

- login: `POST /auth/login` behind a per-IP rate limiter; generic failure
  messages (no user enumeration);
- password hashing: PBKDF2 with per-account 64-hex-char salt, constant-time
  comparison;
- sessions carry a CSRF token required by owner endpoints; issued on success,
  **rotated** on `/api/session`, destroyed on logout, expiry, and on privilege
  change (role mismatch ⇒ destroy);
- cookies set via `setSessionCookie` (`HttpOnly`, `SameSite`);
- owner endpoints require `requireAuth` + owner role + CSRF
  (`src/web/server.ts`); there is **no public registration path** — accounts
  are created by the operator/setup flow;
- `/api/account/sessions` is itself authenticated.

**Recommendation:** confirm the `Secure` cookie flag when TLS terminates in
front of the app, and ensure successful logins are audit-logged.

## 7. Secrets handling

- `.env` is gitignored; `.env.example` contains empty placeholders only
  (only non-secret defaults such as `CREATOR_NAME` and
  `AUTH_DEV_RESET_LINKS=false` are non-empty);
- fail-closed in production: `credential-store.ts` throws if `SESSION_SECRET`
  is missing (development derives a key with a loud warning);
- redaction at the logger boundary (`redactLogMessage`, `scanForSecrets`) and
  again in the AI output guard;
- key-like strings in `scripts/test-security-patterns.ts` are deliberate
  negative test vectors, not credentials.

## 8. Discord permissions

Gateway intents: `Guilds`, `GuildMessages`, `DirectMessages`, `MessageContent`
— no privileged guild-management intents. Slash commands use
`setDefaultMemberPermissions` (`ManageGuild` for settings/personality,
`ModerateMembers` for moderation), so unprivileged members cannot invoke them.
The bot does **not** request `Administrator` for itself; `Administrator` /
`ManageGuild` appear only inside channel-permission *presets* a human admin
applies deliberately.

## 9. Recommendations (not implemented)

1. Pin an explicit MCP server allowlist in configuration.
2. Confirm `Secure` cookie behavior behind production TLS.
3. Enable GitHub branch protection for `main` (exact settings in
   [OPERATIONS.md](./OPERATIONS.md)).
4. Run EXTENDED/LIVE tiers explicitly at release time (see
   [TESTING.md](./TESTING.md)).
