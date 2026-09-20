# AshenAI Development Workflow

## Before Coding

1. Read `docs/ARCHITECTURE.md`
2. Read `docs/AGENT_RULES.md`
3. Read `AGENTS.md` (AI agent loop instructions)
4. Run `git status`
5. Inspect the existing implementation.

## During Coding

- Make the smallest safe change.
- Preserve the existing architecture.
- Avoid unrelated refactors.
- Keep existing tests meaningful.
- Never hide or weaken a failing test.
- Do not overwrite working systems without understanding them first.

## Verification

Run `npm run typecheck`.
Run relevant tests.
Run `npm test` before completing substantial work.

## Git Safety

Never use destructive Git commands unless explicitly instructed.

Do not discard unrelated user changes.

Do not reset the repository simply because the working tree is dirty.
