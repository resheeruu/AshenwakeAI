# AshenAI

AI-powered Discord bot with browser automation, server management, and multi-provider AI routing.

## Quick Start

```bash
npm install
cp .env.example .env    # Configure Discord token + AI providers
npm run build
npm start
```

## Architecture

```
Discord Request
  → command/conversation layer
    → AI router (provider fallback, circuit breaker, caching)
      → task/planner system
        → tool registry → validation → permissions → risk → confirmation
          → execution → audit/tracing → response

Web Research
  → search → HTTP fetch → extraction → browser escalation (when needed)
    → extraction → redaction → evidence → AI response
```

**Key subsystems:**
- AI Router with 16+ provider adapters, fallback, and circuit breaker
- Pattern Router for zero-token deterministic commands
- Conversation memory with Ebbinghaus decay and context compression
- SQLite-backed task persistence, traces, and response cache
- Full tool framework: registry, validator, executor, rate limiter, confirmation store
- Governance: policy engine, drift detection, templates, remediation
- Security: role hierarchy, SSRF protection, audit chain (HMAC-SHA256), output guard
- Browser agent: Playwright-based with session isolation, redirect validation, and resource budgets
- Web pipeline: Brave Search → HTTP fetch → Readability/Cheerio → SPA detection → browser escalation
- Web dashboard: Express server with auth, MFA, OAuth, CSRF protection

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start bot (uses `scripts/start.sh`) |
| `npm run bot` | Start directly via `tsx src/index.ts` |
| `npm test` | Run mandatory test suite (21 suites, 2000+ assertions) |
| `npm run test:smoke` | Production smoke test |
| `npm run test:all` | Run all tests including optional suites |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Compile TypeScript + copy static assets |
| `npm run check` | Lint check + tests |

## Browser Agent

Browser automation via Playwright with:
- **11 tools**: open, navigate, click, type, scroll, wait, extract, screenshot, back, forward, close
- **Session isolation**: separate BrowserContext per user/guild session
- **SSRF protection**: protocol validation, DNS resolution, redirect validation, private IP blocking
- **Resource budgets**: per-session limits on navigations, clicks, types, scrolls, screenshots, extracted bytes
- **Graceful degradation**: disabled when Chromium unavailable; HTTP pipeline continues working

Browser tools require moderator role for write operations (open, navigate, click, type). Read operations (extract, screenshot, scroll) require member role. Click and type require confirmation.

## Security

- **5-tier role hierarchy**: owner > admin > moderator > member > guest
- **Confirmation system**: high-risk actions require one-time-use confirmation bound to user/guild/channel/session/tool/arguments
- **SSRF protection**: blocks private IPs, metadata endpoints, protocol downgrades, DNS rebinding
- **Audit chain**: HMAC-SHA256 signed entries with chain verification
- **Input gateway**: blocks prompt injection, secret extraction attempts
- **Output guard**: prevents leaked secrets and internal config in AI responses
- **Rate limiting**: per-user message limits + per-tool execution limits with role-based multipliers

## Environment

Required:
- `DISCORD_TOKEN` — Discord bot token
- `SESSION_SECRET` — HMAC key for audit signatures (min 16 chars)

Optional AI providers (at least one required):
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.

See `.env.example` for full configuration options.

## Testing

```bash
npm test                    # 21 mandatory suites (~2000+ assertions)
npm run test:smoke          # Production smoke test (103 assertions)
npm run test:all            # All suites including optional
npm run typecheck           # TypeScript check
npm run build               # Build
```

## Deployment

- **Termux ARM64**: Works with graceful browser degradation (HTTP-only when Chromium unavailable)
- **Wispbyte/Linux**: Full browser support when Chromium is installed
- **Docker**: `Dockerfile` included, uses `scripts/start.sh`
- **Render**: Built-in recovery manager with health watchdog

See `docs/DEVELOPMENT.md` for development setup.

## Documentation

- `docs/ARCHITECTURE.md` — Detailed architecture
- `docs/DEVELOPMENT.md` — Development guide
- `docs/ADMIN-MODERATOR-MANUAL.md` — Admin/moderator usage
- `docs/AGENT_RULES.md` — Agent behavior rules
