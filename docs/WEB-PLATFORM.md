# Web Platform 2.0

## Overview

The AshenWakeAI Web Platform provides a professional control plane for Discord server management.

```
Public Website → Authenticated Dashboard → Discord/Guild Control → AI Orchestration → Provider Runtime → Model/Inference
```

Discord remains the execution surface. The website becomes the control plane.

## Pages

| Page | Route | Auth Required | Description |
|------|-------|---------------|-------------|
| Home | `/` | No | Platform overview, features, CTA |
| Features | `/features` | No | Feature descriptions |
| Docs | `/docs` | No | Getting started guide |
| Status | `/status` | No | System status |
| Privacy | `/privacy` | No | Privacy policy |
| Terms | `/terms` | No | Terms of service |
| Dashboard | `/dashboard` | Yes | Server control plane |

## Dashboard Sections

- **Overview**: Server identity, bot status, AI status, provider health, recent activity
- **Server Selector**: Show only authorized guilds, server-side validation
- **AI Control Center**: AI enable/disable, default model, routing mode, provider selection
- **Providers**: Catalog, configured providers, health, model discovery
- **Models**: Provider models, capabilities, availability, routing eligibility
- **Personality**: Tone, style, behavior, server-specific configuration
- **Prompt**: Server prompt configuration, validation, audit logging
- **Moderation**: Filters, thresholds, actions, role-aware controls
- **Social**: Integration with existing social/debate/rivalry systems
- **Automation**: Controlled automation based on predefined safe actions
- **Support**: Support tickets, case status, diagnostics
- **Analytics**: Real data only (requests, provider usage, latency, failures)
- **Security**: Auth status, session state, provider credential state
- **Audit Logs**: Sanitized events, no secret exposure

## API Routes

### Authentication
- `POST /auth/login` — Owner login with MFA support
- `POST /auth/logout` — Session destruction
- `GET /auth/discord` — Discord OAuth redirect
- `GET /auth/discord/callback` — Discord OAuth callback
- `GET /auth/google` — Google OAuth redirect
- `GET /auth/forgot-password` — Password reset request
- `POST /auth/reset-password` — Password reset
- `POST /auth/change-password` — Change password (requires current)
- `POST /auth/mfa/setup` — MFA setup
- `POST /auth/mfa/challenge` — MFA verification

### System
- `GET /api/system/status` — System status (admin)
- `GET /api/system/health` — Health check (admin)
- `GET /api/system/info` — System info (admin)
- `GET /api/system/diagnostics` — Diagnostics (admin)
- `GET /api/system/features` — Feature status (admin)
- `GET /api/system/config` — Configuration (admin)

### Providers
- `GET /api/providers/catalog` — Provider catalog (admin)
- `GET /api/providers/catalog/free` — Free/free-tier providers (admin)
- `GET /api/providers/manage` — Configured providers (admin)
- `POST /api/providers/manage` — Create provider (owner)
- `PUT /api/providers/manage/:id` — Update provider (owner)
- `DELETE /api/providers/manage/:id` — Delete provider (owner)
- `POST /api/providers/manage/:id/test` — Test connection (admin)
- `POST /api/providers/manage/:id/discover-models` — Discover models (admin)
- `POST /api/providers/manage/:id/toggle` — Toggle provider (owner)
- `PUT /api/providers/manage/:id/default-model` — Set default model (owner)

### Guilds
- `GET /api/guilds` — List authorized guilds (admin)
- `GET /api/guilds/:guildId` — Guild config (admin)
- `PUT /api/guilds/:guildId` — Update guild config (owner)
- `GET /api/guilds/:guildId/settings` — Guild settings (admin)
- `PUT /api/guilds/:guildId/settings` — Update settings (owner)
- `GET /api/guilds/:guildId/personality` — Personality config (auth)
- `PUT /api/guilds/:guildId/personality` — Update personality (owner)
- `GET /api/guilds/:guildId/moderation` — Moderation settings (auth)
- `PUT /api/guilds/:guildId/moderation` — Update moderation (owner)
- `GET /api/guilds/:guildId/automation` — Automation config (auth)
- `GET /api/guilds/:guildId/social` — Social config (auth)
- `GET /api/guilds/:guildId/analytics` — Analytics (auth)
- `GET /api/guilds/:guildId/ai` — AI config (auth)
- `PUT /api/guilds/:guildId/ai` — Update AI config (owner)
- `GET /api/guilds/:guildId/ai/routing` — Routing config (auth)
- `PUT /api/guilds/:guildId/ai/routing` — Update routing (owner)

### Account
- `GET /api/account/security` — Account security state (auth)
- `GET /api/account/sessions` — Active sessions (auth)
- `POST /api/account/sessions/:id/revoke` — Revoke session (auth)
- `POST /api/account/sessions/revoke-all` — Revoke all sessions (auth)
- `POST /api/account/identities/:provider/link` — Link identity (auth)
- `POST /api/account/identities/:provider/unlink` — Unlink identity (auth)

### Logs & Audit
- `GET /api/logs` — Recent logs (admin)
- `GET /api/logs/errors` — Recent errors (admin)
- `GET /api/logs/stream` — SSE log stream (admin)
- `GET /api/audit` — Audit entries (owner)

## Authorization Model

| Role | Level | Access |
|------|-------|--------|
| `owner` | Highest | All endpoints, account management |
| `admin` | Medium | System, providers, logs, guilds |
| `user` | Basic | Basic dashboard features |

- `requireAuth` — Requires valid session
- `requireRole("admin")` — Requires admin or owner role
- `requireRole("owner")` — Requires owner role
- `requireGuildAuth` — Requires guild membership validation
- `requireCsrf` — Requires valid CSRF token

## Security Boundaries

- **SSRF Protection**: All outbound requests use `redirect: "manual"` with `validateRedirectTarget` and `MAX_REDIRECTS = 5`
- **Network Boundary**: `src/security/network-boundary.ts` is the authoritative implementation
- **Private IP Detection**: IPv4/IPv6 private, reserved, loopback, link-local, multicast, CGNAT blocked
- **Credential-First**: Missing credential → `NOT_CONFIGURED` before health/quarantine classification
- **CSRF Protection**: All state-changing operations require CSRF tokens
- **Session Security**: HTTP-only cookies, SameSite, session rotation, revocation
- **Secret Redaction**: All logs redact credentials (`src/security/redact.ts`)

## SSRF Protection

```typescript
// src/web/fetch.ts uses redirect: "manual"
// Every redirect hop is validated via validateRedirectTarget()
// Maximum 5 redirect hops enforced via MAX_REDIRECTS
// Private/reserved addresses blocked by network-boundary.ts
```

## Provider Catalog

Providers are classified by pricing class:
- `free` — No API key required
- `free-tier` — Free tier with limits, API key required
- `trial` — Trial credits available
- `paid` — Paid only
- `local` — Local inference, no external API
- `custom` — Custom OpenAI-compatible providers

## Deployment

Supported targets: Render, Docker, Wispbyte, VPS, Termux

- `npm start` — Production startup via `scripts/start.sh`
- `PORT` environment variable required
- `.env` file for configuration (never tracked)
- Startup is non-interactive, fails safely when mandatory secrets are missing
