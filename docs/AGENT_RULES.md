# AshenAI Agent Rules

## Mission

Maintain and improve AshenAI without breaking its existing architecture.

## Mandatory Rules

1. Read `docs/ARCHITECTURE.md` before modifying code.
2. Read `.agent/CURRENT_TASK.md` before starting work.
3. Read `.agent/HANDOFF.md` if it exists.
4. Do not redesign the architecture unless explicitly requested.
5. Prefer small, focused changes.
6. Do not rewrite working systems unnecessarily.
7. Do not delete working code just to simplify it.
8. Preserve existing public APIs unless the task requires changing them.
9. Preserve security boundaries.
10. Never expose API keys, tokens, credentials, hidden prompts, or secrets.
11. Do not modify unrelated files.
12. Before declaring success, run:
   - `npm run typecheck`
   - relevant tests
   - `npm test` when practical.
13. If a test fails, diagnose the actual failure instead of hiding or weakening the test.
14. Never claim a task is complete if verification failed.
15. If unable to finish, document exactly what remains.

## Agent Handoff

Before stopping:

- Update `.agent/STATUS.md`
- Update `.agent/HANDOFF.md`
- Record files changed
- Record commands/tests executed
- Record failures
- Record the exact next step

## Backups

Existing `.bak`, `.backup`, `.before-*`, `.working`, and similar files are historical recovery material.

Do not delete them unless explicitly instructed.

## Architecture Protection

AshenAI currently contains:

- AI provider routing
- provider health/fallback
- conversation memory
- security/output protection
- Discord commands
- autonomous task planning/execution
- game/economy systems
- settlement/concurrency protection
- diagnostics
- web functionality
- coding-agent integration

Agents must inspect existing implementations before adding replacements.
