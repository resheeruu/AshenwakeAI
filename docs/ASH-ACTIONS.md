# AshenAI Anime Actions ("ash" commands)

> Verified against the code in `src/games/anime-actions/`. This documents
> enforced behavior, including the hardening applied in this release.

## 1. Overview

`ash <action> [target]` is a **fictional, roleplay-only** mini-game. Every
action is a scripted anime-style interaction with templated text and (where
available) a small animated media attachment. The engine performs **zero
moderation actions** — it never timeouts, kicks, bans, deletes, or edits
anything on the server. See §7.

## 2. Enabling / disabling (server admins)

The feature is controlled by the guild flag `social.animeActions`
(**default: enabled**):

- Interactive panel: `/settings panel` → **AI Social** → *Anime Actions* toggle.
- Manual: `/settings update social animeActions true` (or `false`).
- Per-server; DMs are unaffected (there is no guild config in DMs).
- When disabled, every `ash` message replies with a clear "disabled" notice
  (no cooldown is consumed, no provider or media work happens).
- If the config cannot be read, the handler **fails closed** (feature off)
  and logs the failure.

## 3. Usage

```
ash <action> @user      target a mentioned user
ash <action>            self-target (Target = optional + Self = yes)
ash <action>            `ash wave` runs targetless (Target = optional, Self = no)
ash <action>            (reply to a message) targets that message's author
ash <action> <id>       raw user id — must resolve to a guild member
ash                     show help
ash actions             show help
```

Aliases work everywhere a name works: `ash h @user`, `ash pu @rival`, etc.
All 25 aliases (one per row where listed in §10): `h`, `cu`, `hp`, `ks`,
`pu`, `kik`, `sl`, `bn`, `bi`, `ht`, `sk`, `th`, `sh`, `st`, `ds`, `ex`,
`wv`, `hf`, `da`, `lf`, `sm`, `pa`, `slp`, `ce`, `ro`. Aliases and their
canonical action share one cooldown key and one cache key — cycling aliases
never bypasses either (tested, L5/C5).

## 4. Rate limits and cooldowns

| Control | Scope | Value |
|---|---|---|
| Command rate limit | per user (all guilds + DMs) | 15 messages / 60s |
| Per-action cooldown | per user + per action | see §10 table (3–10s) |
| Cooldown consumption | — | consumed when the action name is valid, **before** target validation |
| Disabled feature | — | rate limit still applies; cooldown is NOT consumed |

Help replies (`ash`, `ash actions`) are rate-limited too, so a disabled or
configured-off server cannot be spammed through static replies.

### Exact processing order

Every `ash` message passes through these gates in order (pinned by the
static test C7):

```
rate limit → guild flag → help/unknown parse → cooldown → target resolution → guards → engine
```

Consumption semantics:

- **Rate limit** — counted for every `ash` message, including help and
  the "feature disabled" reply.
- **Cooldown** — consumed once the action name resolves to a valid
  action, *before* target validation. An invalid or malformed target
  still burns the cooldown (C1/C2); a successful execution burns it
  (C3); an unknown action name consumes nothing (C4).
- **Provider/media failure** — the cooldown was already consumed;
  the user gets a text-only reply and the cooldown still stands.

### Rate-limit key (abuse scenarios)

The key is `message.author.id` only — deliberately global across guilds
and DMs (accepted trade-off: one shared budget, simpler and stricter than
per-guild buckets). Verified scenarios (L1–L6):

- A — spamming any `ash` message: exactly 15 allowed per 60s, 16th
  rejected with a retry-after.
- B — budget is global: spending it in DMs blocks guild use (and
  vice versa).
- C — rotating actions/targets does not evade the cap.
- D — alias cycling does not evade the cap (shared cooldown key too).
- E — limits are per-user; other users are unaffected.

## 5. Target resolution (fail-closed)

Resolution order: **mention → reply → raw id**. New in this release:

1. A mention or reply resolves directly (Discord guarantees the author
   exists).
2. A raw id is verified with `guild.members.fetch()` — an id that is not a
   member of this server is **rejected** ("I can't find that user here"),
   never silently retargeted.
3. A token that *looks* like a target attempt (`@abc`, malformed `<@id>`,
   ≥10 digits) but parses to nothing usable is likewise **rejected** —
   including for optional-target actions, which previously fell back to
   self-targeting.
4. Ordinary trailing words ("ash dance tonight") are not target attempts
   and keep their old behavior.
5. After a valid target resolves, the existing guards apply: self-target
   and bot-target rules per action.

The cooldown is consumed before target validation (documented and covered
by a regression test).

### Target matrix (what each invocation form does)

| Invocation | Result |
|---|---|
| `ash <action> @mention` | targets the mentioned user |
| `ash <action>` + reply to a message | targets that message's author |
| `ash <action>` + reply to **your own** message | self — allowed if the action allows self, rejected with "on yourself" if not |
| `ash <action> <raw id>` | verified member; non-member/malformed → reject (never self) |
| `ash <action>` (optional + self allowed, e.g. `cry`) | self |
| `ash wave` (optional + **no** self — the only such action) | executes **targetless** |
| `ash <action>` with a garbage trailing token (`@abc`) | reject — never silently self |
| `ash <action> @bot` | allowed for all 32 actions (bot policy, §7.1) |

`wave` is pinned as the single `targetRequired: false` +
`selfTargetAllowed: false` action by test M7, so the targetless
bare-invocation scope cannot silently grow.

### Cooldown / flag state per request state

| State | Rate limit | Cooldown | Reply |
|---|---|---|---|
| Not an `ash` message | not counted | — | — (other handlers run) |
| Help (`ash`, `ash actions`) | counted | — | help text |
| Disabled in guild | counted | — | disabled notice |
| Unknown action | counted | — | unknown notice |
| Valid action, any target outcome | counted | **consumed** | success / cooldown / target error |
| Config read error or corrupt flag value | counted | — | disabled notice (fail closed) |
| DM (no guild config) | counted | per action | normal (flag defaults on) |

## 6. Reply safety

Every reply the handler sends is built through `safeReply()`, which sets
`allowedMentions: { parse: [] }`. Action names and display names are
user-controlled text; suppressing mention parsing means arguments like
`@everyone` can never turn the bot into a mass-ping tool.

## 7. Fictional-vs-moderation boundary

- The engine (`engine.ts`) imports only: action definitions, animation
  providers, media security, emote map, logger.
- No moderation/punishment API (`timeout`, `kick`, `ban`, `purge`,
  automod) exists anywhere under `src/games/anime-actions/`.
- A regression test (`scripts/test-anime-actions.ts`, Phase 3d) scans all
  six files for those tokens and asserts the boundary comment stays in
  `definitions.ts`.
- Runtime tests (W1/W2, E1/E2) execute every combat action through the
  production handler with a Discord-API guard proxy: zero moderation
  calls, and output stays fictional (moderation verbs are only allowed
  as an action's *own* name inside its own copy, e.g. `kick`'s
  "sidesteps the kick" — cross-context verbs are rejected).

### 7.1 Bot target policy

**All 32 actions allow bot targets** (`botTargetAllowed: true`) and every
action ships dedicated `botResponses` written from the bot's perspective
("AshenAI sidesteps the kick gracefully!"). This is intentional and
documented policy, pinned by test B1. The "AshenAI refuses to be a
target" guard still exists in the handler as defense-in-depth (W4) so a
future per-action `false` is enforced without code changes.

## 8. Media & SSRF

Animation URLs pass `validateOutboundUrl` (fail-closed: loopback,
link-local, private ranges, non-allowlisted schemes rejected), an 8s fetch
timeout, a 64KB size cap, and a MIME allowlist before being attached.
Failures degrade to text-only replies (logged as `anime_media result=…`).

### 8.1 Provider chain, fallback, and cache

```
local index hit → remote cache hit → Gifukai API → OtakuGIFs API → text-only reply
```

- **Local first, always.** Before any cache or network work the engine
  resolves `actions:<mediaKey>` against the local GIF index
  (`src/media/local-gifs.ts`). A hit is attached with **zero** provider
  calls and is never written into the remote URL cache (Y3); no remote
  media URL is ever substituted for it. A miss — including a machine
  with no `data/anime-gifs` directory — falls through to the remote
  chain (Y4), so behaviour is unchanged for operators who ship no GIFs.
- The seam is `FetchAnimationOptions.localGifs`: `undefined` = shared
  singleton (production), `null` = local lookup disabled (used by the
  remote-chain tests), object = injected resolver (Y5, Y6). Local
  provider errors are logged (`provider=local result=local_error`)
  and never break the chain.
- Each remote attempt goes through the canonical hardened outbound fetch
  (URL/DNS/redirect/timeout/size enforcement); raw `fetch()` is never
  used and provider URLs never appear in reply text (attachment only).
- Timeouts: 8s per provider; responses capped at 64KB; ≤3 redirects;
  animation URLs ≤2048 chars.
- Remote results are cached per `mediaKey` (= action name) in a 200-entry
  LRU with a 30-minute TTL, up to 5 URLs per action for variety.
  Failures, malformed payloads, and rejected URLs are **never cached**,
  so a bad provider response cannot poison the cache; a hit makes zero
  provider calls (P1–P11).
- Every attempt/fallback is logged (`anime_action action=…
  provider=… result=…`); secrets are never logged.
- Cooldown is consumed before the provider is consulted — a provider
  failure still leaves the cooldown standing (text-only reply).

### 8.2 Local media (operator GIFs)

Layout under the local root (default `data/anime-gifs`, override
`ASHENAI_LOCAL_GIFS_DIR`), one directory per key:

```
data/anime-gifs/
  actions/<mediaKey>/<file>.gif     # 32 Ash keys, e.g. actions/hug/x.gif
  afk/<category>/<file>.gif         # eating, sleep, grass, work, gaming,
                                    # study, break, away, generic
  manifest.json                     # optional attribution (≤2MB)
```

Manifest entry (per file path): `path`, `source`, `sourceUrl`,
`license`. Missing entry → `license: "unspecified"`; malformed or
out-of-root paths are skipped with a logged warning. **No GIFs ship in
the repository** (`data/` is gitignored) — operators supply their own
and own the licensing.

Index + read rules (all fail closed, tested in the `AFK` suite §F and
the anime suite Y1–Y9):

| Guard | Limit |
|---|---|
| Extensions | `.gif .webp .png .jpg .jpeg` only |
| File size | ≤ 8MB |
| Dimensions | ≤ 4096×4096 (from header) |
| Depth | `<root>/{actions\|afk}/<name>/<file>` only |
| Symlinks | skipped at index **and** rejected on read |
| Magic bytes | must match extension (GIF87a/GIF89a/PNG/RIFF-WEBP/JPEG) |
| Paths | rebuilt from `root + relPath`; stored absolute paths never trusted; normalized containment check + `realpath` |
| Keys | allowlist only (`actions:` ↔ 32 mediaKeys, `afk:` ↔ 9 categories) |
| Bounds | ≤100 assets per key, ≤2000 total, `relPath` ≤512 chars |
| Concurrency | single shared build (memoized), generation-guarded, deterministic sort |

Read failures (file removed/corrupted after index) degrade to a
text-only reply (`anime_media result=local_read_failed … fallback=text`)
and the path/root never appear in user-facing content (Y8, Y9). The
index is rebuilt on every start; the AFK suite proves restart
semantics with a real SQLite process (§F/I of `scripts/test-afk.ts`).

### 8.3 GIPHY — NOT INTEGRATED (evaluation only)

GIPHY was researched, **not integrated**. There is no GIPHY dependency,
code, cache, or network call anywhere in `src/`, `scripts/`, or
`package.json` (asserted by `test-afk.ts` K9). Reasons:

- Published terms prohibit caching API responses or media URLs and
  prohibit proxying media through your own server — both incompatible
  with this server's cache-and-attach model.
- Attribution ("Powered by GIPHY") would have to surface in every
  attachment/reply.
- Beta keys are rate-limited to ~100 calls/hour; the `rating` filter
  defaults to ALL, so safe-for-work filtering is opt-in and easy to
  misconfigure.

Reconsideration prerequisites: written TOS review confirming a
server-side cache/attachment flow is permitted, an attribution plan,
a key/quota plan, and an explicit `rating` (and `lang`) configuration —
plus a dedicated suite and an outbound allowlist entry.

## 9. Guild config persistence note

The `social` section is part of `GuildConfigSchema` as of this release.
Previously Zod stripped unknown sections on load, so `social.animeActions`
(and the rest of `social`) silently reverted after a restart.
`scripts/test-ai-social.ts` round-trips every interface section through
the schema and fails if any section is missing.

### 9.1 Restart semantics

| State | Survives restart? |
|---|---|
| `social.animeActions` flag (per guild) | **Yes** — persisted in SQLite (`guild_configs.config_json`), re-read from disk on first use after cache invalidation |
| Action definitions, aliases, cooldown values | **Yes** — code-owned |
| Provider chain + cache contents | definitions yes; the LRU cache is in-memory and simply repopulates |
| Per-action cooldowns | **No** — in-memory `Map`, cleared on restart (users may act immediately after a deploy) |
| Rate-limit budget (15/60s) | **No** — in-memory, reset on restart |
| Config read cache (5 min LRU) | **No** — rebuilt on demand |

Flag state after a restart is verified against a raw SQLite row (R1–R4):
disabled stays disabled, "no stored row" means the documented default
(enabled), and corrupt rows fail closed.

## 10. Action reference
### Affection (5)

| Action | Aliases | Description | Target | Self | Bot | Cooldown |
|---|---|---|---|---|---|---|
| `hug` | `h` | Wrap someone in a warm hug | required | yes | yes | 5s |
| `cuddle` | `cu` | Cuddle up close to someone | required | yes | yes | 5s |
| `pat` | — | Give someone a gentle pat on the head | required | yes | yes | 5s |
| `headpat` | `hp` | Give someone a firm headpat | required | no | yes | 5s |
| `kiss` | `ks` | Blow someone a quick kiss | required | yes | yes | 5s |

### Combat (13)

| Action | Aliases | Description | Target | Self | Bot | Cooldown |
|---|---|---|---|---|---|---|
| `punch` | `pu` | Throw a cartoon punch at someone | required | no | yes | 8s |
| `kick` | `kik` | Land a flashy kick on someone | required | no | yes | 8s |
| `slap` | `sl` | Slap someone with an open hand | required | no | yes | 8s |
| `bonk` | `bn` | Bonk someone on the head | required | no | yes | 8s |
| `bite` | `bi` | Take a playful bite out of someone | required | no | yes | 8s |
| `hit` | `ht` | Smack someone with a stray hit | required | no | yes | 8s |
| `smack` | `sk` | Smack someone across the cheek | required | no | yes | 8s |
| `throw` | `th` | Hurl someone across the room | required | no | yes | 8s |
| `shoot` | `sh` | Fire a toy projectile at someone | required | no | yes | 8s |
| `stab` | `st` | Stab someone with a prop blade | required | no | yes | 8s |
| `kill` | — | Dramatically KO someone in roleplay | required | no | yes | 10s |
| `destroy` | `ds` | Unleash a finishing move on someone | required | no | yes | 10s |
| `explode` | `ex` | Blow someone up in a shower of sparks | required | no | yes | 10s |

### Fun (14)

| Action | Aliases | Description | Target | Self | Bot | Cooldown |
|---|---|---|---|---|---|---|
| `poke` | — | Poke someone until they react | required | yes | yes | 3s |
| `wave` | `wv` | Wave hello at someone | optional | no | yes | 3s |
| `highfive` | `hf` | Give someone a high five | required | no | yes | 3s |
| `yeet` | — | Yeet someone into the void | required | no | yes | 8s |
| `dance` | `da` | Break into a dance with someone | optional | yes | yes | 5s |
| `laugh` | `lf` | Burst out laughing | optional | yes | yes | 3s |
| `cry` | — | Cry it all out (self) | optional | yes | yes | 5s |
| `blush` | — | Blush uncontrollably (self) | optional | yes | yes | 3s |
| `smug` | `sm` | Flash a smug grin (self) | optional | yes | yes | 3s |
| `panic` | `pa` | Panic dramatically (self) | optional | yes | yes | 5s |
| `sleep` | `slp` | Fall asleep on the spot (self) | optional | yes | yes | 5s |
| `celebrate` | `ce` | Celebrate something awesome (self) | optional | yes | yes | 5s |
| `roast` | `ro` | Roast someone with playful trash talk | required | no | yes | 5s |
| `simp` | — | Simp hard for someone | required | no | yes | 5s |

## 11. Tests

- `scripts/test-anime-actions.ts` — **160 checks**: definitions/policy
  matrix (M1–M8), target resolution matrix (X1–X17), cooldown semantics
  (C1–C7), guild flag states (G1–G5), bot policy (B1–B3), provider
  chain/fallback/cache (P1–P11), engine boundary (E1–E5), mention safety
  (R1–R2), moderation spy (W1–W4), concurrency + restart (K1–K5,
  R1–R4), rate-limit abuse scenarios (L1–L6), local media provider
  (Y1–Y10), plus the Phase 3a–3d hardening suites.
  The suite pins the shared local index to an empty temp root at
  startup (`primeLocalMedia`) so remote-chain assertions stay
  deterministic on machines that have operator GIFs installed.
- `scripts/test-ai-social.ts` — includes the config-persistence round-trip.

## 12. Accepted trade-offs

Deliberately unchanged in this release (each verified and documented,
not overshot):

1. **Rate-limit key is the global user id** — one 15/60s budget across
   all guilds and DMs; simpler and stricter than per-guild buckets (L1).
2. **Cooldown consumed before target validation** — a mistyped target
   burns the cooldown; keeps the gate cheap and spam-resistant (C1/C2).
3. **All 32 actions allow bot targets** — intentional uniform policy
   with dedicated `botResponses`; the refuse-guard remains as
   defense-in-depth (§7.1).
4. **Provider architecture unchanged** — chain, cache size/TTL, and
   timeouts kept as-is; only the transport seam was made injectable.
5. **Action wording unchanged** — response copy stays as written;
   moderation-verb checks exempt an action's own name (§7).
