# AFK (prefix-only)

`!afk` marks a user away. When someone later mentions them, AshenAI posts
**one** notice in that channel and suppresses the mentioned user's pings in it.

Implementation: `src/community/afk.ts` (parse/classify/handlers),
`src/database/afk-repo.ts` (persistence), `src/media/local-gifs.ts`
(media), wired in `src/index.ts`.

## 1. Command surface

| Input | Result |
|---|---|
| `!afk <free-form reason>` | set AFK, reason ≤100 chars (Unicode code points, control chars stripped, whitespace collapsed) |
| `!afk` | set AFK with message `AFK` |
| `!afk off` | clear AFK (exact, trimmed, case-insensitive: `!AFK Off`, `!afk OFF`) |
| `!afk off to the races` | **set** — only the exact word `off` clears |
| `!afk2`, `hello !afk`, `!af`, `` | not a command |

- **Prefix-only**: the literal prefix `!` (no prefix abstraction, no slash
  command, no settings surface). Mid-string `!afk` never matches.
- AFK is **guild-scoped**; there is no DM/`!afk` state. Rows always carry a
  real guild id (asserted `test-afk` C7).
- Long/free-form reasons are stored verbatim after sanitising (C8: SQL
  injection strings are stored as data and cannot damage or leak rows).

### Processing order in `src/index.ts`

Bot filter → assistant-channel gate → referenced-message fetch →
**AFK command** (reply + return) → **AFK auto-clear / mention notices**
(fall through) → Ash intercept → AI. The AFK command short-circuits, so
`!afk` in a message never also triggers auto-clear, a mention notice, or
an Ash action (K1–K5). If both an AFK command and Ash content are
present, AFK wins because it returns first.

Trade-off: the assistant-channel gate and bot filter run *before* AFK, so
`!afk` typed in the assistant channel is ignored like any other message
(documented, deliberate — the gate exists to keep that channel clean).

## 2. Persistence & restart

- Table `afk_states(guild_id, user_id, message, started_at, updated_at,
  PRIMARY KEY(guild_id, user_id))` — **migration v18**
  (`src/database/database.ts`).
- `setAfk` is a single-statement UPSERT: `message`/`updated_at` are
  updated, `started_at` is **preserved** so a repeated `!afk` refreshes
  the reason without restarting the elapsed clock (C2, C6).
- `clearAfk` is scoped by guild **and** user (returns `true` once).
- Survives restarts (verified against a real SQLite process, `test-afk`
  I1–I4, including a fresh-database subprocess boot that must apply
  migrations through v18).
- All reads/writes are guild-scoped; concurrent writes are coherent
  (25 simultaneous UPSERTs → one row; J1–J4).

## 3. Auto-clear (`social.afkAutoClear`, default **ON**)

When a user who is AFK sends a non-bot message in a guild:

1. their AFK row is cleared, and
2. one reply is sent: `👋 Welcome back! Your AFK has been cleared.`

- Read as `cfg?.social?.afkAutoClear ?? true` — a missing config, a
  failed config read, or an old database all default to **ON** (D1, D3).
- Set `social.afkAutoClear: false` to keep AFK state until `!afk off`.
- The welcome reply is suppressed when auto-clear is off (state stays),
  in DMs, and for bot authors (D1b, D2, D5).
- A welcome reply **only** fires when that user actually had state — no
  ghost replies for users who were never AFK.

## 4. Mention notices

On any guild message, the mentioned users are looked up **read-only**
(`listAfkByUserIds`, never writes — K20):

- **One consolidated reply per message**, even if several mentioned
  users are AFK, with the AFK users in mention order.
- Cap: **8 lines / ≤1800 chars** — long mention lists are truncated, order
  preserved (E9).
- Per-user line: `💤 <@id> is AFK · <reason> · <elapsed>` (`formatElapsed`:
  just now / minutes / hours / days; a future timestamp reads "just now").
- Dedup: one notice per `channel:afkUser` per **60s**, LRU-bounded at
  500 entries, cleared by the test hook (E6–E8, E11). The dedup key is
  marked **before** the reply, so a failing reply cannot cause repeats.
- Self-mentions are excluded; bots never trigger notices.
- Hostile display names / reasons containing `@everyone` or raw ids are
  **inert** because every AFK reply goes through the shared `safeReply`
  with `allowedMentions: { parse: [] }` — no local mention override
  exists anywhere in `src/community/afk.ts` (zero direct `.reply(` calls,
  K6/K7, E10).
- The notice is *additional* to normal processing: after it, the message
  still flows to the Ash/AI path, so a message that is both a mention of
  an AFK user and an Ash command can produce both replies (documented
  trade-off; the alternative was dropping the Ash command).

## 5. Rate limit

`!afk` is throttled by a dedicated limiter: **5 commands / 60s per user**
(`AFK_RATE_LIMIT_MAX`, `AFK_RATE_LIMIT_WINDOW_MS`), answered with
`Slow down! Try again in Ns.` — separate from the Ash 15/60s budget so
the two cannot starve each other (H1, H4). In-memory: resets on restart
(I1). Mention notices are **not** rate-limited beyond the dedup window.

## 6. Media (local only)

AFK never fetches remote media. The chain is strictly:

```
afk:<category> → afk:away → afk:generic → text-only notice
```

- A specific-category miss falls to `away`, then `generic`; a `generic`
  miss ends at text and **never** loops back to `away` (G1–G4).
- Categories are chosen by `classifyAfkCategory` — keyword rules over a
  fixed 9-value allowlist (`eating, sleep, grass, work, gaming, study,
  break, away, generic`), **never** derived from user text as a path.
  Traversal-like text (`../`, `..\`) short-circuits to `generic`; `zzz…`
  classifies as `sleep` (B section).
- Every read goes through `readLocalGif` revalidation (magic, size,
  dimensions, symlink/realpath containment); failures degrade to text
  (G5).

Layout, manifest schema, security limits, and licensing live in
`docs/ASH-ACTIONS.md` §8.2 — the same shared provider serves all 32 Ash
actions and the AFK categories. **No GIFs ship in the repository**;
operators populate `data/anime-gifs` (or `ASHENAI_LOCAL_GIFS_DIR`) and
own the licensing/attribution for what they add.

## 7. Config summary

| Key | Default | Effect |
|---|---|---|
| `social.afkAutoClear` | `true` | clear AFK on the user's next message |
| `ASHENAI_LOCAL_GIFS_DIR` | `data/anime-gifs` | local GIF root |

## 8. Tests

`scripts/test-afk.ts` — **139 checks**, registered in
`scripts/run-all-tests.ts` as the mandatory CORE suite **AFK** (40th
suite):

| Section | Covers |
|---|---|
| A (23) | command parsing / exact `off` / Unicode & hostile inputs |
| B (20) | category classifier incl. traversal and injection inputs |
| C (10) | repository: UPSERT, isolation, injection, 100-id list cap, read-before-delete hot path |
| D (10) | auto-clear ON/OFF/DM/bot/config-failure |
| E (10) | notices: consolidation, caps, dedup, injection, reset |
| F (25) | local media security: traversal, symlink (incl. manifest), size, dims, magic/ext, manifest, bounds, determinism |
| G (6) | AFK media chain ordering |
| H (3) | rate limit 5/60s + per-user isolation |
| I (4) | restart, fresh-DB migration v18, index rebuild |
| J (8) | concurrency/races |
| K (20) | static source assertions (order, single reply choke, no GIPHY, parameterised SQL, bounds) |

No live Discord testing was performed; all coverage is deterministic and
offline.
