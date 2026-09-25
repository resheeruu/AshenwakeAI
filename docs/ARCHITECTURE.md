# AshenAI Architecture

## Core Principle

AshenAI is a modular Discord AI system with multiple AI providers, intelligent routing, persistent memory, security controls, autonomous task execution, diagnostics, and game/economy systems.

Agents must extend existing modules rather than creating parallel implementations.

## Major Areas

### `src/ai/`

AI abstraction and routing.

Important responsibilities:

- provider adapters
- AI request/response types
- intelligent provider selection
- fallback
- provider health
- performance history
- memory/context integration

### `src/agent/`

Autonomous coding/task agent system.

Important responsibilities:

- task planning
- task lifecycle
- execution
- verification
- self-healing
- diagnostics
- agent management

### `src/coding-agents/`

External coding-agent integration.

This layer should allow multiple coding agents to participate without changing AshenAI's core architecture.

Agents should be treated as interchangeable workers.

### `src/commands/`

Discord command layer.

Commands should remain thin and delegate business logic to appropriate services.

### `src/games/`

Game and economy subsystem.

Important principles:

- atomic mutations
- concurrency protection
- settlement
- rewards
- inventory
- progression
- casino/game logic
- **Ash prefix namespace** (`ash mine`, `ash battle`, `ash lottery`, `ash hunt`, `ash slots`) — games use the `ash` prefix; see `src/games/anime-actions/prefix-handler.ts` for the unified Ash parser
- **Result-authority guarantee** — animations are purely visual; all game outcomes are computed by engines and stored in the database before any animation is displayed (`src/games/animation/index.ts`)

### `src/games/animation/`

Game animation framework.

Provides safe, deterministic animation playback for Ash games. The animation layer is read-only and cannot modify game state, coin balances, or XP values. Flow: engine computes outcome → database updated → animation displayed.

### `src/security/`

Security boundary.

Security code must not be weakened to make another feature work.

### `src/diagnostics/`

Health checking and optimization.

### `src/web/`

Web interface/server functionality.

### `scripts/`

Development, testing, diagnostics, and verification scripts.

## Data Flow

User/Discord
    ↓
Command Handler
    ↓
AI / Game / Task subsystem
    ↓
Core services
    ↓
Persistence / external providers

For coding-agent work:

Task
    ↓
Planner
    ↓
Coding Agent
    ↓
Repository changes
    ↓
Typecheck/tests
    ↓
Verification
    ↓
Handoff
    ↓
Next Agent

## Multi-Agent Principle

Agents do not independently redefine AshenAI.

They share:

- architecture
- rules
- current task
- status
- handoff
- verification requirements

An agent that runs out of quota or stops must leave enough state for another agent to continue safely.

---

## Request Path (verified against the code)

This documents the actual code path a Discord request takes, and where each
control is enforced. File references are stable entry points; see the
security notes in [SECURITY-BOUNDARIES.md](./SECURITY-BOUNDARIES.md).

```
Discord gateway
  │  intents: Guilds, GuildMessages, DirectMessages, MessageContent (src/index.ts)
  ▼
Interaction / message entry
  ├─ slash commands        → src/commands/*              (thin handlers)
  └─ conversational chat   → src/discord/conversational-agent.ts
  ▼
AI orchestration
  ├─ tool selection        → src/ai/tools/registry.ts
  ├─ input validation      → src/ai/tools/validator.ts      (scopes, allowed values, guild config)
  ├─ permission boundary   → src/security/tool-permissions.ts (public/agent/fix/admin)
  ├─ risk evaluation       → src/security/risk-engine.ts    (safe/low/medium/high/critical)
  ├─ confirmation          → src/discord/interactions/confirmation-handler.ts
  │                          + src/ai/tools/confirmation-store.ts
  ├─ rate limiting         → src/security/rate-limit.ts and src/ai/tools/tool-rate-limit.ts
  ├─ execution             → src/ai/tools/executor.ts       (ordered checks, dry-run support)
  ▼
AI provider selection
  ├─ registry              → src/ai/providers/index.ts + registry.ts (ProviderRegistry)
  ├─ routing/fallback      → src/ai/router.ts               (selection, retries, health state)
  ├─ adapters              → src/ai/providers/<provider>.ts (per-vendor HTTP)
  └─ health/lifecycle      → getHealthReport() in router + assessProviderLifecycle()
  ▼
Response
  ├─ output guard/redaction→ src/security/output-guard.ts, src/security/redact.ts
  ├─ tool audit            → src/ai/tools/audit.ts (recordToolAudit)
  └─ security audit        → src/security/audit.ts (recordAudit)
  ▼
Persistence (src/database/database.ts — better-sqlite3, WAL, foreign_keys=ON,
ordered migrations tracked in schema_migrations)
```

### Where the controls live

| Control | Module |
|---|---|
| Authentication (owner login, password hashing, MFA) | `src/control/auth.ts`, `src/control/account-store.ts` |
| Session lifecycle (issue/rotate/expire/destroy) | `src/control/session-store.ts` |
| Authorization (roles, Discord permissions) | `src/security/permissions.ts`, `src/commands/*` |
| AI tool authorization boundary | `src/security/tool-permissions.ts` |
| Rate limiting (HTTP + per-tool) | `src/security/rate-limit.ts`, `src/ai/tools/tool-rate-limit.ts` |
| Risk evaluation | `src/security/risk-engine.ts` |
| Human confirmation for dangerous actions | `src/discord/interactions/confirmation-handler.ts` |
| Secret redaction (before logging/output) | `src/security/redact.ts`, `src/security/output-guard.ts` |
| Outbound network (SSRF) boundary | `src/security/network-boundary.ts` |
| Audit trail | `src/security/audit.ts`, `src/ai/tools/audit.ts`, `src/security/audit-integrity.ts` |
| Production tool registration (fail-fast) | `src/ai/tools/discord/bootstrap.ts` (registered + counted before preflight) |
| Confirmation buttons (render + double-exec guard) | `src/discord/interactions/tool-confirmation-ui.ts`, `confirmation-handler.ts`, `conversational-agent.ts` (`executeUnifiedPlan`) |
| Settings panel + modal dispatch | `src/commands/settings.ts` (`/settings panel`, `/settings update`, `st:`/`an:` modals) |
| Support case authorization | `src/commands/support.ts` (`hasCaseStaffAccess`), `src/support/case-manager.ts` (guild-scoped) |
| Anime action feature flag | `src/games/anime-actions/prefix-handler.ts` (`social.animeActions`, fail-closed) |
| AFK (prefix `!afk`) | `src/community/afk.ts`, `src/database/afk-repo.ts` (migration v18 `afk_states`, `social.afkAutoClear` default ON) — [AFK.md](./AFK.md) |
| Local GIF provider (local-first media) | `src/media/local-gifs.ts` (`ASHENAI_LOCAL_GIFS_DIR`, default `data/anime-gifs`; ships no GIFs) |
| Gateway health observer | `src/core/discord-health.ts` (consumed by `/status`, web, control service) |
| Startup readiness | `src/core/preflight.ts`, `src/core/health-checker.ts` |
| Process execution (shell) | `src/agent/tools.ts`, `src/agent/supervisor/supervisor.ts`, `src/coding-agents/coordinator.ts`, `src/core/update-manager.ts`, `src/cli.ts` |
| Background self-update | `src/core/update-manager.ts` (background timer only; no HTTP/AI trigger) |
| Health endpoint | `GET /api/health` in `src/web/server.ts` |
| Graceful shutdown | `SIGINT`/`SIGTERM` handlers in `src/index.ts` |

### Provider concepts (do not conflate these)

These are four different things. The code keeps them separate:

- **registered** — the provider object exists in `ProviderRegistry` (discovery)
- **configured** — a credential/API key is available right now
- **available** — `isAvailable()` is true, i.e. the provider could serve a request
- **healthy** — the router recorded a successful request for it

Preflight enumerates **registered** providers regardless of credentials and
classifies credential-less ones as `NOT_CONFIGURED` *before* consulting any
persisted health state (`classifyProviderStatus` in `src/core/preflight.ts`).

### Discord interaction surface (hardened this release)

Verified behavior of the interaction entry points:

- **Slash commands** — registered once from `create*Command()` factories
  (`src/index.ts`, registration list). Guild-only commands
  (`settings`, `support`, `moderation`, `access`, `server`, `prompt`,
  `personality`) declare `.setContexts(InteractionContextType.Guild)` so
  Discord hides them in DMs (deprecated `setDMPermission` not used).
  `ask`, `game`, `reset`, `status`, `help` keep the default contexts and
  work in DMs. Handlers that resolve guild state additionally re-check
  `message.guildId`/interaction guild in code (`settings`, `support`,
  `moderation`, `access`, `server`, `personality`); `prompt` is
  guild-only via contexts and relies on its builder-session store.
- **`/settings`** — the root command has two subcommands: `panel`
  (interactive selects/modals, Admin+) and `update`
  (`<category> <setting> <value>`, Admin+). Discord renders a root
  command with subcommands as unusable when invoked bare; both paths are
  reachable and covered by `scripts/test-discord-wiring.ts` §K.
  Modal/role-select callbacks are dispatched by exact customId match
  (`isSettingsModalCustomId`), not `startsWith`.
- **Confirmation flow** — button interactions carry a planId; the store
  verifies requester, guild, channel/session binding, expiry, and
  execution state before rendering (`verifyPlan`), and `executeUnifiedPlan`
  refuses to execute the same plan twice (double-exec guard). Cancel is
  requester-checked in `confirmation-handler.ts`.
- **Conversational chat** — `src/discord/conversational-agent.ts` is the
  only non-`ash` message path that runs the AI; it consumes the same
  executor pipeline (validation → permission → risk → rate limit →
  confirmation → execution → audit).
- **`ash` anime actions** — text-message commands gated by
  `social.animeActions` (fail-closed), 15/min per-user rate limit,
  per-action cooldowns, fail-closed target resolution, and
  `allowedMentions: { parse: [] }` on every reply. Full reference:
  [ASH-ACTIONS.md](./ASH-ACTIONS.md).
- **AFK** — literal-prefix `!afk`, handled *before* the `ash` intercept
  (command returns, notices fall through). Guild-persistent state, one
  consolidated suppressed-mention notice per message, local-only GIF
  media. Full reference: [AFK.md](./AFK.md).
- **Health** — `src/core/discord-health.ts` records ready-state, latency,
  gateway uptime, shards, and reconnects; `/status` reads the live
  snapshot (no hardcoded strings), the web control surface and
  `formatDiscordHealthField` share it.
