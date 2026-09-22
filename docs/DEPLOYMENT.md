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

### 3. Install Dependencies

```bash
npm ci --no-fund --no-audit
```

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with required values:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id
SESSION_SECRET=your_session_secret_minimum_16_chars

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
If Wispbyte sets `PORT=9002`, AshenAI will listen on port 9002.

### 6. Verify

```bash
# Check health endpoint
curl http://localhost:$PORT/health

# Check Discord connection in logs
# Should see: "✅ Logged in as YourBot#1234"
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Discord application client ID |
| `SESSION_SECRET` | Strong random secret for session encryption (min 16 chars) |

### Optional

| Variable | Description |
|----------|-------------|
| `PORT` | Web server port (defaults to 3000 if not set by hosting) |
| `NODE_ENV` | Set to `production` for production deployment |
| `AI provider keys` | See `.env.example` for full list |
| `ASHENAI_OWNER_USERNAME` | Dashboard owner username |
| `ASHENAI_OWNER_PASSWORD_HASH` | Dashboard owner password hash |

### Wispbyte Panel Variables

```env
NODE_ENV=production
PORT=9002          # or whatever Wispbyte assigns
SESSION_SECRET=<random_secret>
DISCORD_TOKEN=<your_token>
DISCORD_CLIENT_ID=<your_client_id>
```

## Startup Sequence

1. `npm start` runs `scripts/start.sh`
2. `start.sh` validates Node.js, checks `node_modules`
3. Sources `check-resources.sh` for disk/RAM/CPU status
4. Launches `src/index.ts` via tsx
5. Application validates config, connects to Discord
6. Web server starts on configured PORT
7. Health endpoint available at `/health`

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
