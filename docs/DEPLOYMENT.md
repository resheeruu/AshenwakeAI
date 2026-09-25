# AshenAI Wispbyte Deployment Guide

## Requirements

- Node.js 22.x
- ~256 MB RAM minimum
- ~15 MB free disk space (application only)
- No browser, Java, or FFmpeg required

## Fresh Deployment

### 1. Install Node.js 22.x

```bash
# Wispbyte typically provides Node.js 22.x via the panel
node --version  # Should show v22.x
```

### 2. Clone/Upload Repository

```bash
git clone <your-repo-url> .
# or upload the repository files
```

### 3. Install Dependencies and Build

```bash
# Full install (development)
npm ci --no-fund --no-audit

# Production install (Wispbyte / CI-prod equivalent) — also works:
npm ci --omit=dev --no-fund --no-audit
```

Then build once during the **build phase** (never at runtime):

```bash
npm run build
```

The **build toolchain is part of the runtime dependencies** (`esbuild`,
`typescript`, `tsx`, `@types/express`, `@types/better-sqlite3`,
`@types/node`, `@types/turndown`), so a production install still has
everything needed to compile `dist/`. `npm run build` uses the low-memory
esbuild transpile (~5 MB wrapper heap, ~1-2s for 329 files) instead of
`tsc` emit, because `tsc` OOMs on memory-constrained hosts (Wispbyte Node
22 exits 134 at ~294-303 MB heap). Full strict type safety is preserved
via `npm run typecheck` (CI runs `tsc --noEmit` separately).

`dist/` is rebuilt only when sources change — restarts reuse the existing
`dist/` with zero compilation.

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with required values:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id
SESSION_SECRET=your_session_secret_minimum_32_chars

# At least one AI provider
GROQ_API_KEY=your_groq_key
# or GEMINI_API_KEY, OPENROUTER_API_KEY, etc.

# Optional: owner account (for dashboard)
ASHENAI_OWNER_USERNAME=admin
ASHENAI_OWNER_PASSWORD_HASH=...
ASHENAI_OWNER_PASSWORD_SALT=...
```

### 5. Start

```bash
npm start
```

The application uses `process.env.PORT` for the web server port.
Resolution order: **process environment (host/panel) → `.env` → 8080 fallback**.
AshenAI binds `0.0.0.0` (container-safe).

**Wispbyte does not inject `PORT` automatically.** The allocated port is shown
in Console → Address, and it must be supplied by you in Startup →
Environment Variables:

```env
# Startup → Environment Variables
PORT=9002              # must match Console → Address
NODE_ENV=production
```

```text
Startup Command: npm start
```

If `PORT` is missing from the environment the app keeps the **8080** fallback
and will not match the port Wispbyte routes to. The 8080 fallback exists for
local use only — set the panel value in production.

### 6. Verify

```bash
# Check health endpoint (use host PORT; default 8080 if unset)
curl http://localhost:${PORT:-8080}/api/health

# Check Discord connection in logs
# Should see: "✅ Logged in as YourBot#1234"
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Discord application client ID |
| `SESSION_SECRET` | Strong random secret for session encryption (min 32 chars) |

### Optional

| Variable | Description |
|----------|-------------|
| `PORT` | Web server port (host-provided; defaults to **8080** if not set) |
| `NODE_ENV` | Set to `production` for production deployment |
| `AI provider keys` | See `.env.example` for full list |
| `ASHENAI_OWNER_USERNAME` | Dashboard owner username |
| `ASHENAI_OWNER_PASSWORD_HASH` | Dashboard owner password hash |

### Wispbyte Panel Variables

Set these in **Startup → Environment Variables** (the panel does not inject
them for you):

```env
NODE_ENV=production
PORT=9002          # must match Console → Address; Wispbyte does NOT auto-inject PORT
SESSION_SECRET=<random_secret>
DISCORD_TOKEN=<your_token>
DISCORD_CLIENT_ID=<your_client_id>
```

Startup Command:

```bash
npm start
```

## Startup Sequence

1. Wispbyte **build phase**: `npm ci` then `npm run build`
   (`scripts/build-dist.cjs` — low-memory esbuild transpile + web-asset copy)
2. Wispbyte **start phase**: `npm start` → `scripts/start.sh`
   (no `prestart` hook — nothing compiles at runtime, so there is no
   `tsc` OOM at ~294-303 MB heap / exit 134)
3. `start.sh` exports `NODE_ENV` (deterministic `production` default), resolves
   `PORT` (environment → `.env` → 8080), validates Node.js/npm, checks
   `node_modules` and requires the pre-built `dist/index.js`
4. Sources `check-resources.sh` for disk/RAM/CPU status
5. Launches `node dist/index.js` (fast production path — zero compilation,
   restarts never rebuild)
6. Application validates config, connects to Discord
7. Web server starts on configured PORT
8. Health endpoint available at `/api/health`

## Graceful Shutdown

The application handles:
- `SIGTERM` — standard hosting shutdown signal
- `SIGINT` — Ctrl+C
- `SIGUSR2` — restart signal

Shutdown sequence:
1. Stop update manager
2. Stop session cleanup
3. Stop agent
4. Stop support automation
5. Close database
6. Disconnect Discord
7. Exit

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
lsof -i :$PORT
# Or use a different port
PORT=3001 npm start
```

### Database Issues

The SQLite database is at `data/ashenai.db`. If corrupted:
```bash
# Back up and remove to start fresh
mv data/ashenai.db data/ashenai.db.backup
npm start  # Creates new database
```

Operator restore: `npx tsx scripts/restore-backup.ts` lists backups; pass a backup id to restore it (`scripts/restore-backup.ts`). Never restore a backup over a live data directory without verifying the checksums first — the restore function verifies ciphertext integrity and the plaintext checksum before writing.

### Low Disk Space

```bash
# Check disk usage
bash scripts/check-resources.sh
npm run diagnose:disk
```

### Missing Dependencies

```bash
npm ci --no-fund --no-audit
npm rebuild better-sqlite3
```

## Architecture Summary

```
AshenAI
├── Discord Runtime (commands, events, buttons, modals)
├── AI Platform (16+ providers, router, memory, safety)
├── Web (owner dashboard, health, HTTP retrieval)
├── Persistence (SQLite, JSON state, sessions)
├── Security (auth, SSRF, rate limits, audit)
└── Runtime (resource monitoring, graceful shutdown)
```

No browser stack. No Java. No embedded Lavalink. No FFmpeg required.
