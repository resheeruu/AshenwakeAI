# AshenAI Development Workflow

## Before Coding

1. Read `docs/ARCHITECTURE.md`
2. Read `docs/AGENT_RULES.md`
3. Run `git status`
4. Inspect the existing implementation.

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

### Storage diagnostics

When diagnosing storage failures on hosted deployments, do not assume that `df`
output equals the hosting account quota:

```bash
npm run diagnose:disk                  # read-only path inventory (no writes)
npm run diagnose:disk -- --probe=220   # bounded 220 MB write probe per path
npm run diagnose:playwright            # Playwright availability + per-path storage
```

These distinguish physical device storage, host machine storage,
container-visible filesystem capacity, hosting account/server quota, and
filesystem/writable-layer limits (overlay upperdir, `/tmp` tmpfs, inodes).
They never delete files to "fix" ENOSPC and state explicitly when the hosting
quota cannot be verified from inside the container.

## Git Safety

Never use destructive Git commands unless explicitly instructed.

Do not discard unrelated user changes.

Do not reset the repository simply because the working tree is dirty.
