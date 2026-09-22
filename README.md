# AshenAI

AI-powered Discord bot with server management, multi-provider AI routing, and lightweight HTTP web retrieval.

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
  → search → HTTP fetch → extraction → redaction → evidence → AI response
```

**Key subsystems:**
- AI Router with 16+ provider adapters, fallback, and circuit breaker
- Pattern Router for zero-token deterministic commands
- Conversation memory with Ebbinghaus decay and context compression
- SQLite-backed task persistence, traces, and response cache
- Full tool framework: registry, validator, executor, rate limiter, confirmation store
- Governance: policy engine, drift detection, templates, remediation
- Security: role hierarchy, SSRF protection, audit chain (HMAC-SHA256), output guard
- Web pipeline: Brave Search → HTTP fetch → Readability/Cheerio → markdown conversion
- Web dashboard: Express server with auth, MFA, OAuth, CSRF protection

## AI Providers

16+ provider adapters with automatic fallback and circuit breaker:

Groq, Gemini, OpenRouter, OpenAI, Anthropic, Cohere, DeepSeek, Mistral, xAI, Cerebras, Fireworks, Novita, NVIDIA, Ollama, SambaNova, Together, HuggingFace, Local LLM, OpenAI-compatible (any provider)

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start bot (uses `scripts/start.sh`) |
| `npm run bot` | Start directly via `tsx src/index.ts` |
| `npm test` | Run mandatory test suite (36 suites, 2000+ assertions) |
| `npm run test:smoke` | Production smoke test |
| `npm run test:all` | Run all tests including optional suites |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Compile TypeScript + copy static assets |
| `npm run check` | Lint check + tests |

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
npm test                    # 36 mandatory suites (~2000+ assertions)
npm run test:smoke          # Production smoke test
npm run test:all            # All suites including optional
npm run typecheck           # TypeScript check
npm run build               # Build
```

## Deployment

- **Termux ARM64**: Works (lightweight HTTP web retrieval, no browser required)
- **Wispbyte/Linux**: Recommended — lightweight, fits within 1 GB quota
- **Docker**: `Dockerfile` included, uses `scripts/start.sh`
- **Render**: Built-in recovery manager with health watchdog

### Storage / ENOSPC diagnostics (hosting-aware)

A large `df -h` value is **not** proof that the hosting account has enough storage.
These are different layers:

1. physical device storage
2. host machine storage
3. container-visible filesystem capacity (what `df`/`statfs` report in-container)
4. hosting account/server quota (usually **not** visible in-container)
5. filesystem / writable-layer limits (overlay upperdir, `/tmp` tmpfs, inode
   exhaustion, per-directory quotas, provider per-container limits)

```bash
npm run diagnose:disk                 # read-only inventory of every pipeline path
npm run diagnose:disk -- --probe=220  # bounded 220 MB write probe per path
```

Diagnostics report `Actual Wispbyte storage quota could not be verified from
inside the container.` and never delete files to "fix" ENOSPC. Startup scripts do
the same (`scripts/check-resources.sh`).

See `docs/DEPLOYMENT.md` for Wispbyte deployment guide.
See `docs/DEVELOPMENT.md` for development setup.

## Documentation

- `docs/DEPLOYMENT.md` — Wispbyte deployment guide
- `docs/ARCHITECTURE.md` — Detailed architecture
- `docs/DEVELOPMENT.md` — Development guide
- `docs/ADMIN-MODERATOR-MANUAL.md` — Admin/moderator usage
- `docs/AGENT_RULES.md` — Agent behavior rules

## Known Limitations

- **Native modules**: `better-sqlite3` requires native compilation; may need build tools on some platforms
- **Music system**: Removed — no audio playback functionality
