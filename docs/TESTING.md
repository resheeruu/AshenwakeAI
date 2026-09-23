# Testing Strategy

The runner is `scripts/run-all-tests.ts`. It owns the single suite registry —
never duplicate suite lists elsewhere.

## Tiers

| Tier | When it runs | Command | Requirements |
|---|---|---|---|
| **CORE** | every PR (CI) | `npm test` | no credentials, no network, deterministic |
| **EXTENDED** | before a release | `npm run test:all` (`--all`) | may be slower / DB-backed / stateful |
| **LIVE** | manual, with real infra | individual `tsx scripts/test-*.ts` | real provider keys, hosting, browser |

- **CORE = the 36 mandatory suites.** They run sequentially and **fail fast** by
  default: the first failing suite aborts the rest, so CI fails fast and loud.
  `Preflight`, `Router`, and `Provider Lifecycle` are CORE and must stay CORE.
- **EXTENDED** suites are the previously "optional" feature suites
  (U3–U19) plus `Provider Platform`. They run with `--all` and never abort the
  run — every failure is reported.
- **LIVE** suites need real infrastructure: `Providers` (live API keys),
  `U17 Hosting` (environment-dependent). They must never require production
  secrets in normal CI.

Each suite carries `tier` metadata in `scripts/run-all-tests.ts`.

## Diagnostic mode

```bash
npm run test:diagnostic        # all CORE suites, no fail-fast, full failure list
npm run test:diagnostic -- --all   # also runs EXTENDED/LIVE
```

`--diagnostic` reuses the same runner and the same suite definitions: it only
changes failure handling (continue instead of abort). The summary prints a
`FAILED SUITES:` line listing every suite that failed. Exit code is still 1 if
anything failed. `npm test` remains fail-fast.

## Optional-suite classification (evidence based)

| Suite | Tier | Verdict |
|---|---|---|
| Providers | LIVE | still relevant — genuinely needs live API keys |
| Provider Platform | EXTENDED | **was an orphan (never registered) and failing** — fixed in this audit (FK seeding); now registered |
| U3–U6, U9–U16, U17 Portability, U19 | EXTENDED | relevant feature coverage; candidates for promotion to CORE once proven deterministic |
| U7, U8, U8 Enhancements | EXTENDED | flagged "pre-existing failures" — keep optional until repaired; do **not** promote while red |
| U17 Hosting | LIVE | environment-dependent and currently failing — keep LIVE, fix on hosting work |

Orphan scripts that exist but are registered nowhere (e.g. `test-smoke.ts`,
`test-discord-gateway*.mjs`) are reachable explicitly via their own commands
(`npm run test:smoke`) but are not part of any tier — audit them before
promoting.

## Rules

1. Never weaken or delete an assertion to make CORE green.
2. Never mark a CORE suite optional to avoid a failure.
3. New security regression tests go into an existing CORE suite (keeps the
   count at 36 and runs on every PR), unless they need new infrastructure —
   then EXTENDED.
4. Tests must be deterministic: no live network, no real secrets, no reliance
   on developer `.env`.
