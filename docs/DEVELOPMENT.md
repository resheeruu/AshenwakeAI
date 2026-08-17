# AshenAI Development Workflow

## Before Coding

1. Read `docs/ARCHITECTURE.md`
2. Read `docs/AGENT_RULES.md`
3. Read `.agent/CURRENT_TASK.md`
4. Read `.agent/HANDOFF.md`
5. Read `.agent/STATUS.md`
6. Run `git status`
7. Inspect the existing implementation.

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

## Handoff

Before stopping, update `.agent/STATUS.md` and `.agent/HANDOFF.md`.

Record:
- files changed
- commands/tests executed
- failures
- exact next step

## Agent Switching

If an agent stops, another agent must read the shared task and handoff state and continue from the actual repository state.

## Git Safety

Never use destructive Git commands unless explicitly instructed.

Do not discard unrelated user changes.

Do not reset the repository simply because the working tree is dirty.
