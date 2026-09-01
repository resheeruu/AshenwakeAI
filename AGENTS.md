

Install and fully wire `better-sqlite3` and `zod` into the existing bot.

Use one centralized SQLite DatabaseService with automatic initialization, WAL mode, migrations, transactions, and safe error handling. Use Zod to validate database/config data.

Integrate SQLite where it actually benefits AshenAI: guild config, trusted users, /prompt sessions/history, audit records, usage statistics, persistent memory, and relevant state.

Preserve the existing architecture and APIs. Do not create duplicate memory, router, executor, security, permission, or agent systems.

Keep /prompt as the only builder mode. Keep /ask, mentions, replies, and /send behavior unchanged.

Do not block Discord response paths with synchronous database writes. Defer non-critical persistence so /ask remains fast.

Do not store secrets or API keys.

Inspect first, modify only what is necessary, then run typecheck, build, and all existing tests. Fix any failures.


Now do a second-pass integration audit.

Inspect the entire AshenAI codebase and verify better-sqlite3 + Zod are actually being used correctly, not just installed.

Check:
- guild config persistence
- trusted users
- /prompt private sessions, memory, expiry, confirmation, audit and undo
- persistent conversation memory
- usage/analytics
- server state that should persist across restarts
- startup/shutdown database handling
- migrations and schema upgrades
- indexes and SQLite performance
- WAL and transaction usage
- Zod validation at database boundaries
- concurrent requests and duplicate writes
- database error recovery

Remove redundant JSON persistence only where SQLite fully replaces it. Do not remove existing fallback behavior unless it is proven safe.

Verify that /ask, mentions and replies remain fast and have no blocking database writes before their AI response.

Verify /prompt still performs deterministic server operations locally without unnecessary LLM calls.

Do not create duplicate systems or rewrite unrelated architecture.

Run typecheck, build, and every existing test. Add focused tests for persistence, migrations, validation, restart recovery, and concurrent operations.

Report exactly what is now stored in SQLite and what remains outside SQLite.
