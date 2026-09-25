/* ================================================================
 * ANIME ACTION SYSTEM TEST SUITE
 *
 * Tests action definitions, engine, prefix parsing, media security,
 * animation providers, safety, and integration.
 * ================================================================ */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client, Message } from "discord.js";

import {
  getAction,
  getAllActions,
  getActionsByCategory,
  resolveResponse,
} from "../src/games/anime-actions/definitions";
import {
  isAnimeActionPrefix,
  handleAnimeAction,
} from "../src/games/anime-actions/prefix-handler";
import { loadGuildConfig, saveGuildConfig, deleteGuildConfig } from "../src/core/guild-config";
import { getSettingById } from "../src/settings/definitions";
import {
  getAnimationCacheStats,
  clearAnimationCache,
  fetchAnimation,
  buildProviders,
  type AnimeHttpClient,
} from "../src/games/anime-actions/providers";
import { executeAction, buildDiscordResponse } from "../src/games/anime-actions/engine";
import {
  initializeLocalGifs,
  resetLocalGifsForTests,
  isValidLocalGifKey,
  AFK_CATEGORIES,
  type LocalGifAsset,
} from "../src/media/local-gifs";
import { invalidateGuildConfigCache } from "../src/database/guild-config-repo";
import { getDatabase } from "../src/database/database";
import {
  validateMediaUrl,
} from "../src/games/anime-actions/media-security";
import {
  animeEmote,
  hasAnimeEmote,
  isValidAnimeEmote,
  allAnimeEmoteNames,
  ANIME_EMOTE_MAP,
  animeTextFallback,
  type AnimeEmoteName,
} from "../src/discord/anime-emotes";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`  ✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`  ❌ ${name}`, error ?? "");
  failed++;
}

console.log("\n🧪 Anime Action System Test Suite\n");

// ─────────────────────────────────────
// ACTION DEFINITIONS
// ─────────────────────────────────────

console.log("--- Action Definitions ---");

// 1. All actions load
try {
  const actions = getAllActions();
  if (actions.length >= 30) {
    pass(`All actions loaded (${actions.length})`);
  } else {
    fail("All actions loaded", `Expected >=30, got ${actions.length}`);
  }
} catch (e) {
  fail("All actions loaded", e);
}

// 2. Action lookup by name
try {
  const action = getAction("hug");
  if (action && action.name === "hug" && action.category === "affection") {
    pass("Action lookup by name");
  } else {
    fail("Action lookup by name", action?.name);
  }
} catch (e) {
  fail("Action lookup by name", e);
}

// 3. Action lookup by alias
try {
  const action = getAction("pu");
  if (action && action.name === "punch") {
    pass("Action lookup by alias");
  } else {
    fail("Action lookup by alias", action?.name);
  }
} catch (e) {
  fail("Action lookup by alias", e);
}

// 4. Unknown action returns undefined
try {
  const action = getAction("nonexistent");
  if (action === undefined) {
    pass("Unknown action returns undefined");
  } else {
    fail("Unknown action returns undefined", action);
  }
} catch (e) {
  fail("Unknown action returns undefined", e);
}

// 5. Categories work
try {
  const affection = getActionsByCategory("affection");
  const combat = getActionsByCategory("combat");
  const fun = getActionsByCategory("fun");
  if (affection.length >= 5 && combat.length >= 5 && fun.length >= 8) {
    pass(`Categories: ${affection.length} affection, ${combat.length} combat, ${fun.length} fun`);
  } else {
    fail("Categories", { affection: affection.length, combat: combat.length, fun: fun.length });
  }
} catch (e) {
  fail("Categories", e);
}

// 6. Response resolution (normal target)
try {
  const action = getAction("punch")!;
  const { text } = resolveResponse(action, "Alice", "Bob", false, false);
  if (text.includes("Alice") && text.includes("Bob")) {
    pass("Response resolution (normal target)");
  } else {
    fail("Response resolution (normal target)", text);
  }
} catch (e) {
  fail("Response resolution (normal target)", e);
}

// 7. Response resolution (bot target)
try {
  const action = getAction("punch")!;
  const { text } = resolveResponse(action, "Alice", "AshenAI", true, false);
  if (text.includes("AshenAI") || text.includes("Alice")) {
    pass("Response resolution (bot target)");
  } else {
    fail("Response resolution (bot target)", text);
  }
} catch (e) {
  fail("Response resolution (bot target)", e);
}

// 8. Response resolution (self target)
try {
  const action = getAction("hug")!;
  const { text } = resolveResponse(action, "Alice", "Alice", false, true);
  if (text.includes("Alice")) {
    pass("Response resolution (self target)");
  } else {
    fail("Response resolution (self target)", text);
  }
} catch (e) {
  fail("Response resolution (self target)", e);
}

// 9. Combat outcomes exist
try {
  const action = getAction("punch")!;
  if (action.outcomes && action.outcomes.length === 5) {
    pass("Combat outcomes exist");
  } else {
    fail("Combat outcomes exist", action.outcomes?.length);
  }
} catch (e) {
  fail("Combat outcomes exist", e);
}

// 10. All actions have mediaKey
try {
  const actions = getAllActions();
  const allHaveMediaKey = actions.every((a) => a.mediaKey.length > 0);
  if (allHaveMediaKey) {
    pass("All actions have mediaKey");
  } else {
    fail("All actions have mediaKey");
  }
} catch (e) {
  fail("All actions have mediaKey", e);
}

// ─────────────────────────────────────
// NEW ACTION LOOKUPS
// ─────────────────────────────────────

console.log("\n--- New Actions ---");

// 11. New combat actions exist
try {
  const hit = getAction("hit");
  const smack = getAction("smack");
  const throw_ = getAction("throw");
  const shoot = getAction("shoot");
  const stab = getAction("stab");
  const kill = getAction("kill");
  const destroy = getAction("destroy");
  const explode = getAction("explode");
  if (hit && smack && throw_ && shoot && stab && kill && destroy && explode) {
    pass("New combat actions exist (8)");
  } else {
    fail("New combat actions exist");
  }
} catch (e) {
  fail("New combat actions exist", e);
}

// 12. New fun actions exist
try {
  const laugh = getAction("laugh");
  const smug = getAction("smug");
  const panic = getAction("panic");
  const sleep = getAction("sleep");
  const celebrate = getAction("celebrate");
  const roast = getAction("roast");
  const simp = getAction("simp");
  if (laugh && smug && panic && sleep && celebrate && roast && simp) {
    pass("New fun actions exist (7)");
  } else {
    fail("New fun actions exist");
  }
} catch (e) {
  fail("New fun actions exist", e);
}

// 13. New alias lookups work
try {
  const ht = getAction("ht");
  const sk = getAction("sk");
  const th = getAction("th");
  const sh = getAction("sh");
  const st = getAction("st");
  const ds = getAction("ds");
  const ex = getAction("ex");
  const lf = getAction("lf");
  const sm = getAction("sm");
  const pa = getAction("pa");
  const slp = getAction("slp");
  const ce = getAction("ce");
  const ro = getAction("ro");
  const da = getAction("da");
  if (ht && sk && th && sh && st && ds && ex && lf && sm && pa && slp && ce && ro && da) {
    pass("New alias lookups work (14)");
  } else {
    fail("New alias lookups work");
  }
} catch (e) {
  fail("New alias lookups work", e);
}

// ─────────────────────────────────────
// PREFIX PARSING
// ─────────────────────────────────────

console.log("\n--- Prefix Parsing ---");

// 14. "ash hug @user" detected
try {
  if (isAnimeActionPrefix("ash hug @user")) {
    pass("'ash hug @user' detected");
  } else {
    fail("'ash hug @user' detected");
  }
} catch (e) {
  fail("'ash hug @user' detected", e);
}

// 15. "ash" alone detected
try {
  if (isAnimeActionPrefix("ash")) {
    pass("'ash' alone detected");
  } else {
    fail("'ash' alone detected");
  }
} catch (e) {
  fail("'ash' alone detected", e);
}

// 16. "ash actions" detected
try {
  if (isAnimeActionPrefix("ash actions")) {
    pass("'ash actions' detected");
  } else {
    fail("'ash actions' detected");
  }
} catch (e) {
  fail("'ash actions' detected", e);
}

// 17. Non-ash prefix not detected
try {
  if (!isAnimeActionPrefix("!hug @user")) {
    pass("Non-ash prefix not detected");
  } else {
    fail("Non-ash prefix not detected");
  }
} catch (e) {
  fail("Non-ash prefix not detected", e);
}

// 18. "@AshenAI hug @user" not detected
try {
  if (!isAnimeActionPrefix("@AshenAI hug @user")) {
    pass("Mention format not detected as prefix");
  } else {
    fail("Mention format not detected as prefix");
  }
} catch (e) {
  fail("Mention format not detected as prefix", e);
}

// 19. Case insensitive
try {
  if (isAnimeActionPrefix("ASH hug @user") || isAnimeActionPrefix("Ash Hug @user")) {
    pass("Case insensitive prefix detection");
  } else {
    fail("Case insensitive prefix detection");
  }
} catch (e) {
  fail("Case insensitive prefix detection", e);
}

// ─────────────────────────────────────
// SAFETY
// ─────────────────────────────────────

console.log("\n--- Safety ---");

// 20. Social "kick" is NOT a moderation kick
try {
  const action = getAction("kick");
  if (action && action.category === "combat" && !action.name.includes("moderation")) {
    pass("Social 'kick' is NOT moderation");
  } else {
    fail("Social 'kick' is NOT moderation", action);
  }
} catch (e) {
  fail("Social 'kick' is NOT moderation", e);
}

// 21. Social actions don't require moderation permissions
try {
  const actions = getAllActions();
  const allNoPerms = actions.every((a) => a.name !== "moderation");
  if (allNoPerms) {
    pass("No moderation actions in anime system");
  } else {
    fail("No moderation actions in anime system");
  }
} catch (e) {
  fail("No moderation actions in anime system", e);
}

// 22. All actions have cooldowns
try {
  const actions = getAllActions();
  const allHaveCooldowns = actions.every((a) => a.cooldownMs > 0);
  if (allHaveCooldowns) {
    pass("All actions have cooldowns");
  } else {
    fail("All actions have cooldowns");
  }
} catch (e) {
  fail("All actions have cooldowns", e);
}

// 23. All actions have responses
try {
  const actions = getAllActions();
  const allHaveResponses = actions.every((a) => a.responses.length > 0);
  if (allHaveResponses) {
    pass("All actions have response templates");
  } else {
    fail("All actions have response templates");
  }
} catch (e) {
  fail("All actions have response templates", e);
}

// 24. Bot target actions have bot responses
try {
  const actions = getAllActions();
  const botAllowed = actions.filter((a) => a.botTargetAllowed);
  const allHaveBotResponses = botAllowed.every((a) => a.botResponses.length > 0);
  if (allHaveBotResponses) {
    pass("Bot-targeted actions have bot responses");
  } else {
    fail("Bot-targeted actions have bot responses");
  }
} catch (e) {
  fail("Bot-targeted actions have bot responses", e);
}

// 25. Violent actions are fictional only
try {
  const kill = getAction("kill")!;
  const destroy = getAction("destroy")!;
  const explode = getAction("explode")!;
  const allFictional = [kill, destroy, explode].every(
    (a) => a.category === "combat" && a.botTargetAllowed
  );
  if (allFictional) {
    pass("Violent actions are fictional (bot-targetable)");
  } else {
    fail("Violent actions are fictional");
  }
} catch (e) {
  fail("Violent actions are fictional", e);
}

// ─────────────────────────────────────
// MEDIA SECURITY
// ─────────────────────────────────────

console.log("\n--- Media Security ---");

// 26. HTTPS required
try {
  const result = validateMediaUrl("http://example.com/gif.gif");
  if (!result.ok) {
    pass("HTTP rejected");
  } else {
    fail("HTTP rejected");
  }
} catch (e) {
  fail("HTTP rejected", e);
}

// 27. HTTPS accepted
try {
  const result = validateMediaUrl("https://api.gifukai.com/hug");
  if (result.ok) {
    pass("HTTPS accepted");
  } else {
    fail("HTTPS accepted", result.error);
  }
} catch (e) {
  fail("HTTPS accepted", e);
}

// 28. Localhost rejected
try {
  const result = validateMediaUrl("https://localhost/gif.gif");
  if (!result.ok) {
    pass("Localhost rejected");
  } else {
    fail("Localhost rejected");
  }
} catch (e) {
  fail("Localhost rejected", e);
}

// 29. 127.0.0.1 rejected
try {
  const result = validateMediaUrl("https://127.0.0.1/gif.gif");
  if (!result.ok) {
    pass("127.0.0.1 rejected");
  } else {
    fail("127.0.0.1 rejected");
  }
} catch (e) {
  fail("127.0.0.1 rejected", e);
}

// 30. Metadata endpoint rejected
try {
  const result = validateMediaUrl("https://169.254.169.254/latest/meta-data/");
  if (!result.ok) {
    pass("Metadata endpoint rejected");
  } else {
    fail("Metadata endpoint rejected");
  }
} catch (e) {
  fail("Metadata endpoint rejected", e);
}

// 31. Private IP rejected
try {
  const result = validateMediaUrl("https://10.0.0.1/gif.gif");
  if (!result.ok) {
    pass("Private IP rejected");
  } else {
    fail("Private IP rejected");
  }
} catch (e) {
  fail("Private IP rejected", e);
}

// 32. 192.168.x.x rejected
try {
  const result = validateMediaUrl("https://192.168.1.1/gif.gif");
  if (!result.ok) {
    pass("192.168.x.x rejected");
  } else {
    fail("192.168.x.x rejected");
  }
} catch (e) {
  fail("192.168.x.x rejected", e);
}

// 33. 172.16-31.x.x rejected
try {
  const result = validateMediaUrl("https://172.16.0.1/gif.gif");
  if (!result.ok) {
    pass("172.16.x.x rejected");
  } else {
    fail("172.16.x.x rejected");
  }
} catch (e) {
  fail("172.16.x.x rejected", e);
}

// 34. Invalid URL rejected
try {
  const result = validateMediaUrl("not-a-url");
  if (!result.ok) {
    pass("Invalid URL rejected");
  } else {
    fail("Invalid URL rejected");
  }
} catch (e) {
  fail("Invalid URL rejected", e);
}

// 35. .local host rejected
try {
  const result = validateMediaUrl("https://myhost.local/gif.gif");
  if (!result.ok) {
    pass(".local host rejected");
  } else {
    fail(".local host rejected");
  }
} catch (e) {
  fail(".local host rejected", e);
}

// ─────────────────────────────────────
// CACHE
// ─────────────────────────────────────

console.log("\n--- Cache ---");

// 36. Cache stats work
try {
  clearAnimationCache();
  const stats = getAnimationCacheStats();
  if (stats.size === 0 && stats.max === 200) {
    pass("Cache stats work");
  } else {
    fail("Cache stats work", stats);
  }
} catch (e) {
  fail("Cache stats work", e);
}

// 37. Cache tracks requests and failures
try {
  const stats = getAnimationCacheStats();
  if (typeof stats.requests === "number" && typeof stats.failures === "number") {
    pass("Cache tracks requests and failures");
  } else {
    fail("Cache tracks requests and failures", stats);
  }
} catch (e) {
  fail("Cache tracks requests and failures", e);
}

// ─────────────────────────────────────
// INTEGRATION
// ─────────────────────────────────────

console.log("\n--- Integration ---");

// 38. All actions have emoji
try {
  const actions = getAllActions();
  const allHaveEmoji = actions.every((a) => a.emoji.length > 0);
  if (allHaveEmoji) {
    pass("All actions have emoji");
  } else {
    fail("All actions have emoji");
  }
} catch (e) {
  fail("All actions have emoji", e);
}

// 39. All actions have valid category
try {
  const actions = getAllActions();
  const validCategories = ["affection", "combat", "fun"];
  const allValid = actions.every((a) => validCategories.includes(a.category));
  if (allValid) {
    pass("All actions have valid category");
  } else {
    fail("All actions have valid category");
  }
} catch (e) {
  fail("All actions have valid category", e);
}

// 40. Aliases don't collide
try {
  const actions = getAllActions();
  const aliasMap = new Map<string, string>();
  let collision = false;
  for (const action of actions) {
    for (const alias of action.aliases) {
      if (aliasMap.has(alias)) {
        collision = true;
        break;
      }
      aliasMap.set(alias, action.name);
    }
    if (collision) break;
  }
  if (!collision) {
    pass("No alias collisions");
  } else {
    fail("No alias collisions");
  }
} catch (e) {
  fail("No alias collisions", e);
}

// 41. No action name collisions
try {
  const actions = getAllActions();
  const nameSet = new Set<string>();
  let collision = false;
  for (const action of actions) {
    if (nameSet.has(action.name)) {
      collision = true;
      break;
    }
    nameSet.add(action.name);
  }
  if (!collision) {
    pass("No action name collisions");
  } else {
    fail("No action name collisions");
  }
} catch (e) {
  fail("No action name collisions", e);
}

// 42. mediaKey doesn't collide
try {
  const actions = getAllActions();
  const mediaKeys = actions.map((a) => a.mediaKey);
  const uniqueKeys = new Set(mediaKeys);
  if (uniqueKeys.size === mediaKeys.length) {
    pass("No mediaKey collisions");
  } else {
    fail("No mediaKey collisions");
  }
} catch (e) {
  fail("No mediaKey collisions", e);
}

// 43. Categories are balanced
try {
  const affection = getActionsByCategory("affection");
  const combat = getActionsByCategory("combat");
  const fun = getActionsByCategory("fun");
  if (affection.length >= 5 && combat.length >= 10 && fun.length >= 10) {
    pass(`Balanced categories: ${affection.length}/${combat.length}/${fun.length}`);
  } else {
    fail("Categories balanced", { affection: affection.length, combat: combat.length, fun: fun.length });
  }
} catch (e) {
  fail("Categories balanced", e);
}

// ─────────────────────────────────────
// ANIME EMOTES
// ─────────────────────────────────────

console.log("\n--- Anime Emotes ---");

// 44. animeEmote returns text fallback when no custom emoji configured
try {
  const result = animeEmote("hug");
  if (typeof result === "string" && result.length > 0) {
    pass("animeEmote returns text fallback");
  } else {
    fail("animeEmote returns text fallback", result);
  }
} catch (e) {
  fail("animeEmote returns text fallback", e);
}

// 45. All action emoteNames map to valid anime emotes
try {
  const actions = getAllActions();
  const allValid = actions
    .filter((a) => a.emoteName)
    .every((a) => isValidAnimeEmote(a.emoteName!));
  if (allValid) {
    pass("All action emoteNames map to valid anime emotes");
  } else {
    fail("All action emoteNames map to valid anime emotes");
  }
} catch (e) {
  fail("All action emoteNames map to valid anime emotes", e);
}

// 46. All emote names are valid
try {
  const names = allAnimeEmoteNames();
  const allValid = names.every((n) => isValidAnimeEmote(n));
  if (allValid && names.length >= 30) {
    pass(`All ${names.length} emote names are valid`);
  } else {
    fail("All emote names are valid", { count: names.length, allValid });
  }
} catch (e) {
  fail("All emote names are valid", e);
}

// 47. Text fallbacks never contain Unicode emoji
try {
  const names = allAnimeEmoteNames();
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{2764}\u{FE0F}\u{20E3}\u{E0020}-\u{E007F}]/gu;
  const withEmoji = names.filter((n) => {
    const fallback = animeTextFallback(n);
    return emojiRegex.test(fallback);
  });
  if (withEmoji.length === 0) {
    pass("Text fallbacks contain no Unicode emoji");
  } else {
    fail("Text fallbacks contain no Unicode emoji", withEmoji);
  }
} catch (e) {
  fail("Text fallbacks contain no Unicode emoji", e);
}

// 48. animeEmote returns text fallback (no custom emoji configured)
try {
  const result = animeEmote("slap");
  if (result === "[slap]") {
    pass("animeEmote('slap') returns '[slap]'");
  } else {
    fail("animeEmote('slap') returns '[slap]'", result);
  }
} catch (e) {
  fail("animeEmote('slap') returns '[slap]'", e);
}

// 49. ANIME_EMOTE_MAP has all required categories
try {
  const hasReactions = "happy" in ANIME_EMOTE_MAP && "smug" in ANIME_EMOTE_MAP;
  const hasActions = "hug" in ANIME_EMOTE_MAP && "slap" in ANIME_EMOTE_MAP;
  const hasSystem = "ai" in ANIME_EMOTE_MAP && "success" in ANIME_EMOTE_MAP;
  if (hasReactions && hasActions && hasSystem) {
    pass("ANIME_EMOTE_MAP has all categories");
  } else {
    fail("ANIME_EMOTE_MAP has all categories");
  }
} catch (e) {
  fail("ANIME_EMOTE_MAP has all categories", e);
}

// 50. Every anime emote has env var configured
try {
  const names = allAnimeEmoteNames();
  const allHaveEnv = names.every((n) => {
    const config = ANIME_EMOTE_MAP[n];
    return config && config.envVar.length > 0 && config.textFallback.length > 0;
  });
  if (allHaveEnv) {
    pass("All emotes have env var and text fallback configured");
  } else {
    fail("All emotes have env var and text fallback configured");
  }
} catch (e) {
  fail("All emotes have env var and text fallback configured", e);
}

// ─────────────────────────────────────
// ZERO UNICODE POLICY
// ─────────────────────────────────────

console.log("\n--- Zero Unicode Policy ---");

// 51. Action emoji fields contain no Unicode
try {
  const actions = getAllActions();
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{2764}\u{FE0F}\u{20E3}\u{E0020}-\u{E007F}]/gu;
  const withEmoji = actions.filter((a) => emojiRegex.test(a.emoji));
  if (withEmoji.length === 0) {
    pass("Action emoji fields contain no Unicode");
  } else {
    fail("Action emoji fields contain no Unicode", withEmoji.map((a) => a.name));
  }
} catch (e) {
  fail("Action emoji fields contain no Unicode", e);
}

// 52. Response templates contain no Unicode emoji
try {
  const actions = getAllActions();
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{2764}\u{FE0F}\u{20E3}\u{E0020}-\u{E007F}]/gu;
  let found = false;
  for (const action of actions) {
    for (const r of [...action.responses, ...action.botResponses, ...action.selfResponses]) {
      if (emojiRegex.test(r)) {
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (!found) {
    pass("Response templates contain no Unicode emoji");
  } else {
    fail("Response templates contain no Unicode emoji");
  }
} catch (e) {
  fail("Response templates contain no Unicode emoji", e);
}

// ─────────────────────────────────────
// P2-3: social.animeActions flag enforcement (behavioral)
// ─────────────────────────────────────

const p23GuildId = "guild-p23-animeflag";
const p23UserId = "user-p23-anime";

interface AshMsgOpts {
  /** Simulates a Discord mention resolving to this user id. */
  mentionId?: string;
  /** Simulates a reply to an existing cached message. */
  replyTo?: { id: string; authorId: string };
  /** Simulates a reply whose target message is NOT cached/deleted. */
  referenceOnly?: boolean;
  /** member.displayName (used by the engine for {author}). */
  memberName?: string;
  /**
   * Guild shape for raw-id resolution:
   *   plain   — members.fetch resolves any id
   *   missing — members.fetch returns null (not a member)
   *   throws  — members.fetch throws (inaccessible)
   *   (absent) — no guild (DM-like; raw ids skip the fetch)
   */
  guildMode?: "plain" | "missing" | "throws";
}

function mkAshMessage(
  content: string,
  guildId: string | null,
  userId = p23UserId,
  opts: AshMsgOpts = {},
): { msg: Message; replies: string[]; raw: any[] } {
  const replies: string[] = [];
  const raw: any[] = [];
  const base: any = {
    content,
    guildId,
    author: { id: userId, username: "tester" },
    mentions: {
      users: {
        size: opts.mentionId ? 1 : 0,
        first: () => (opts.mentionId ? { id: opts.mentionId } : null),
        has: () => Boolean(opts.mentionId),
      },
    },
    member: opts.memberName ? { displayName: opts.memberName } : undefined,
    reference: opts.replyTo || opts.referenceOnly ? { messageId: opts.replyTo?.id ?? "missing-ref" } : undefined,
    channel:
      opts.replyTo || opts.referenceOnly
        ? {
            messages: {
              cache: opts.replyTo
                ? new Map([
                    [opts.replyTo.id, { id: opts.replyTo.id, author: { id: opts.replyTo.authorId } }],
                  ])
                : new Map<string, unknown>(),
            },
          }
        : undefined,
    reply: async (payload: unknown) => {
      raw.push(payload);
      replies.push(typeof payload === "string" ? payload : JSON.stringify(payload));
    },
  };
  if (opts.referenceOnly) {
    base.fetchReference = async () => {
      throw new Error("Unknown Message");
    };
  }
  if (opts.guildMode === "plain") {
    base.guild = { id: guildId, members: { fetch: async (id: string) => ({ id, displayName: "TargetUser" }) } };
  } else if (opts.guildMode === "missing") {
    base.guild = { id: guildId, members: { fetch: async () => null } };
  } else if (opts.guildMode === "throws") {
    base.guild = {
      id: guildId,
      members: {
        fetch: async () => {
          throw new Error("Missing Access");
        },
      },
    };
  }
  return { msg: base as unknown as Message, replies, raw };
}

const p23Client = { user: { id: "bot-p23-anime" } } as unknown as Client;

function p23Config(animeActions: boolean): ReturnType<typeof loadGuildConfig> {
  const cfg = { ...loadGuildConfig(p23GuildId) } as any;
  cfg.social = {
    enabled: true,
    animeActions,
    channels: {},
    customReactions: false,
    customEmoji: false,
    rivalryMode: false,
    debateMode: false,
    globalCooldownMs: 30000,
    maxResponsesPerHour: 10,
  };
  return cfg;
}

/* ================================================================
 * LOCAL MEDIA FIXTURES
 *
 * The shared local GIF provider auto-initialises to the default
 * operator root (data/anime-gifs). On a machine where an operator
 * has installed GIFs, remote-chain assertions would otherwise see
 * local hits and fail. Pinning the singleton to an EMPTY root at
 * startup makes every remote test deterministic everywhere; the
 * local-first behaviour itself is then proven in localMediaTests.
 * ================================================================ */

const tmpRoots: string[] = [];

function makeTmpRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(root);
  return root;
}

function gifBytes(width: number, height: number, fill = 0x41): Buffer {
  const buf = Buffer.alloc(32, fill);
  buf.write("GIF89a", 0, "latin1");
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

async function primeLocalMedia(): Promise<void> {
  resetLocalGifsForTests();
  await initializeLocalGifs({ root: makeTmpRoot("ashenai-gifs-empty-") });
}

async function p23FlagTests(): Promise<void> {
  const hug = getAction("hug");
  if (hug && hug.targetRequired && hug.cooldownMs > 0) {
    pass("P2-3 precondition: hug requires a target and has a real cooldown");
  } else {
    fail("P2-3 precondition: hug requires a target and has a real cooldown", hug);
  }

  saveGuildConfig(p23Config(false));
  try {
    // 1. Disabled guild: even an unknown action never reaches the parser.
    const t1 = mkAshMessage("ash frobnicate", p23GuildId);
    const r1 = await handleAnimeAction(t1.msg, p23Client);
    if (r1 === true && t1.replies[0]?.includes("disabled in this server")) {
      pass("Disabled guild: ash command replies with the disabled notice");
    } else {
      fail("Disabled guild: ash command replies with the disabled notice", t1.replies);
    }

    // 2. Disabled guild: known action also gated, no cooldown consumed here.
    const t2 = mkAshMessage("ash hug", p23GuildId);
    await handleAnimeAction(t2.msg, p23Client);
    if (t2.replies[0]?.includes("disabled in this server")) {
      pass("Disabled guild: known action is gated before target/cooldown work");
    } else {
      fail("Disabled guild: known action is gated before target/cooldown work", t2.replies);
    }

    // Flip the flag on (same guild) and prove the disabled attempt
    // did NOT consume hug's 5s cooldown: the next allowed run must
    // reach target validation ("Who should …"), not a cooldown reply.
    saveGuildConfig(p23Config(true));
    const t3 = mkAshMessage("ash hug", p23GuildId);
    await handleAnimeAction(t3.msg, p23Client);
    const t3reply = t3.replies[0] ?? "";
    if (t3reply.includes("Who should") && !t3reply.includes("cooldown")) {
      pass("Disabled attempt does NOT consume the action cooldown");
    } else {
      fail("Disabled attempt does NOT consume the action cooldown", t3.replies);
    }

    // 3. Enabled guild: gate opens, parser runs (unknown action reply).
    const t4 = mkAshMessage("ash frobnicate", p23GuildId);
    await handleAnimeAction(t4.msg, p23Client);
    if (t4.replies[0]?.includes("Unknown action")) {
      pass("Enabled guild: gate opens and the parser runs");
    } else {
      fail("Enabled guild: gate opens and the parser runs", t4.replies);
    }

    // 4. DMs (no guild config) stay enabled.
    const t5 = mkAshMessage("ash frobnicate", null);
    await handleAnimeAction(t5.msg, p23Client);
    if (t5.replies[0]?.includes("Unknown action")) {
      pass("DM: anime actions remain available (no guild config)");
    } else {
      fail("DM: anime actions remain available (no guild config)", t5.replies);
    }

    // 5. Config read failure fails CLOSED (disabled), not open.
    const t6 = mkAshMessage("ash frobnicate", p23GuildId);
    await handleAnimeAction(t6.msg, p23Client, {
      loadConfig: () => {
        throw new Error("simulated config failure");
      },
    });
    if (t6.replies[0]?.includes("disabled in this server")) {
      pass("Config read failure fails CLOSED (feature disabled)");
    } else {
      fail("Config read failure fails CLOSED (feature disabled)", t6.replies);
    }
  } finally {
    deleteGuildConfig(p23GuildId);
  }

  // 6. Static: gate placement and fail-closed marker in source.
  try {
    const handlerSrc = fs.readFileSync(path.resolve("src/games/anime-actions/prefix-handler.ts"), "utf8");
    if (handlerSrc.includes("flag === undefined || flag === null ? true : flag === true")) {
      pass("Handler flag semantics: null/undefined default ON; only explicit true enables; corrupt fails closed");
    } else {
      fail("Handler flag semantics: null/undefined default ON; only explicit true enables; corrupt fails closed");
    }
    if (handlerSrc.includes("failing closed")) {
      pass("Handler logs config failures as failing closed");
    } else {
      fail("Handler logs config failures as failing closed");
    }
    const rateLimitIdx = handlerSrc.indexOf("actionRateLimiter.check");
    const gateIdx = handlerSrc.indexOf("cfg?.social?.animeActions");
    const cooldownCallIdx = handlerSrc.indexOf("const cooldown = checkCooldown(", gateIdx);
    if (rateLimitIdx >= 0 && gateIdx > rateLimitIdx && cooldownCallIdx > gateIdx) {
      pass("Order: rate limit → flag gate → cooldown (gate precedes cooldown)");
    } else {
      fail("Order: rate limit → flag gate → cooldown (gate precedes cooldown)", { rateLimitIdx, gateIdx, cooldownCallIdx });
    }
  } catch (e) {
    fail("Static gate checks", e);
  }

  // 7. The flag is admin-reachable: settings descriptor exists.
  try {
    const descriptor = getSettingById("social.animeActions");
    if (descriptor && descriptor.type === "boolean" && descriptor.category === "social" && descriptor.defaultValue === true) {
      pass("social.animeActions is editable via the settings panel/update command");
    } else {
      fail("social.animeActions is editable via the settings panel/update command", descriptor);
    }
  } catch (e) {
    fail("social.animeActions is editable via the settings panel/update command", e);
  }
}

async function phase3Tests(): Promise<void> {
  /* ── 3a: every action carries a description ── */
  const all = getAllActions();
  if (all.length === 32) {
    pass(`All 32 actions registered (${all.length})`);
  } else {
    fail(`All 32 actions registered (got ${all.length})`);
  }
  const missingDesc = all.filter((a) => !a.description || a.description.trim().length < 5).map((a) => a.name);
  if (missingDesc.length === 0) {
    pass("Every action has a meaningful description");
  } else {
    fail("Every action has a meaningful description", missingDesc);
  }

  /* ── 3b: explicit-but-unresolvable targets fail CLOSED ── */

  // 1. Malformed mention-like token (@abc) on a target-required action:
  //    rejected with guidance, never silently retargeted.
  const t1 = mkAshMessage("ash punch @abc", "guild-p3-targets", "user-p3-a");
  await handleAnimeAction(t1.msg, p23Client);
  if (t1.replies[0]?.includes("can't find that user")) {
    pass("Malformed target token is rejected (no silent fallback)");
  } else {
    fail("Malformed target token is rejected (no silent fallback)", t1.replies);
  }

  // 2. Well-formed raw id of a user who is NOT in the guild:
  //    membership fetch fails → explicit-but-unresolvable → reject.
  const t2 = mkAshMessage("ash punch <@123456789012345678>", "guild-p3-targets", "user-p3-b");
  (t2.msg as any).guild = {
    id: "guild-p3-targets",
    members: { fetch: async () => null },
  };
  await handleAnimeAction(t2.msg, p23Client);
  if (t2.replies[0]?.includes("can't find that user")) {
    pass("Nonexistent guild member target is rejected (fail closed)");
  } else {
    fail("Nonexistent guild member target is rejected (fail closed)", t2.replies);
  }

  // 3. Well-formed raw id that DOES resolve (the author themselves):
  //    resolution accepts it and flow reaches the self-target guard —
  //    proves resolvable ids are not falsely rejected, without
  //    running the engine (no network).
  const selfId = "333333333333333333";
  const t3 = mkAshMessage(`ash punch ${selfId}`, "guild-p3-targets", selfId);
  (t3.msg as any).guild = {
    id: "guild-p3-targets",
    members: { fetch: async () => ({ id: selfId }) },
  };
  await handleAnimeAction(t3.msg, p23Client);
  if (t3.replies[0]?.includes("on yourself")) {
    pass("Resolvable raw id passes target resolution (guard reached)");
  } else {
    fail("Resolvable raw id passes target resolution (guard reached)", t3.replies);
  }

  // 4. Optional-target action with a garbage target must NOT
  //    silently self-target.
  const t4 = mkAshMessage("ash wave @abc", "guild-p3-targets", "user-p3-d");
  await handleAnimeAction(t4.msg, p23Client);
  if (t4.replies[0]?.includes("can't find that user") && !t4.replies[0]?.includes("yourself")) {
    pass("Optional-target action rejects garbage target instead of self-targeting");
  } else {
    fail("Optional-target action rejects garbage target instead of self-targeting", t4.replies);
  }

  /* ── 3c: every reply suppresses mention parsing ── */
  const suppressed =
    JSON.stringify(t1.raw[0]?.allowedMentions?.parse) === "[]" &&
    JSON.stringify(t4.raw[0]?.allowedMentions?.parse) === "[]";
  if (suppressed) {
    pass("Replies set allowedMentions { parse: [] } (no mass-ping vector)");
  } else {
    fail("Replies set allowedMentions { parse: [] } (no mass-ping vector)", t1.raw[0]);
  }

  // Engine-bound replies (user-controlled echo) are also suppressed.
  const t5 = mkAshMessage("ash @everyone", "guild-p3-targets", "user-p3-e");
  await handleAnimeAction(t5.msg, p23Client);
  const t5payload = t5.raw[0];
  if (
    t5payload?.content?.includes("Unknown action") &&
    JSON.stringify(t5payload?.allowedMentions?.parse) === "[]"
  ) {
    pass("User-controlled action-name echo is mention-suppressed");
  } else {
    fail("User-controlled action-name echo is mention-suppressed", t5payload);
  }

  /* ── 3d: fictional roleplay boundary — no moderation APIs ── */
  try {
    const files = ["definitions.ts", "engine.ts", "index.ts", "media-security.ts", "prefix-handler.ts", "providers.ts"];
    const banned = [
      /\.timeout\s*\(/,
      /\.\s*ban\s*\(/,
      /\.\s*kick\s*\(/,
      /\.\s*mute\s*\(/,
      /bulkDelete\s*\(/,
      /purge\s*\(/,
      /from\s+"[^"]*\/moderation\//,
      /from\s+"[^"]*automod/,
    ];
    const hits: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(path.resolve(`src/games/anime-actions/${f}`), "utf8");
      for (const pattern of banned) {
        if (pattern.test(text)) hits.push(`${f}: ${pattern}`);
      }
    }
    if (hits.length === 0) {
      pass("Anime actions engine uses zero moderation/punishment APIs");
    } else {
      fail("Anime actions engine uses zero moderation/punishment APIs", hits);
    }
    const defs = fs.readFileSync(path.resolve("src/games/anime-actions/definitions.ts"), "utf8");
    if (defs.includes("No Discord moderation permissions are required")) {
      pass("Definitions retain the fictional-roleplay boundary statement");
    } else {
      fail("Definitions retain the fictional-roleplay boundary statement");
    }
  } catch (e) {
    fail("Fictional-vs-moderation boundary checks", e);
  }
}

/* ================================================================
 * FINAL PRODUCTION PASS — 32-action matrix, aliases, targets,
 * cooldowns, rate limits, flag states, providers, concurrency,
 * restart, moderation spy, mention safety.
 * ================================================================ */

/** Canonical policy expected for every action (audit reference). */
type PolicyRow = [category: string, aliases: string, targetReq: 0 | 1, self: 0 | 1, bot: 0 | 1, cooldown: number];

const EXPECTED_POLICY: Record<string, PolicyRow> = {
  hug: ["affection", "h", 1, 1, 1, 5_000],
  cuddle: ["affection", "cu", 1, 1, 1, 5_000],
  pat: ["affection", "", 1, 1, 1, 5_000],
  headpat: ["affection", "hp", 1, 0, 1, 5_000],
  kiss: ["affection", "ks", 1, 1, 1, 5_000],
  punch: ["combat", "pu", 1, 0, 1, 8_000],
  kick: ["combat", "kik", 1, 0, 1, 8_000],
  slap: ["combat", "sl", 1, 0, 1, 8_000],
  bonk: ["combat", "bn", 1, 0, 1, 8_000],
  bite: ["combat", "bi", 1, 0, 1, 8_000],
  hit: ["combat", "ht", 1, 0, 1, 8_000],
  smack: ["combat", "sk", 1, 0, 1, 8_000],
  throw: ["combat", "th", 1, 0, 1, 8_000],
  shoot: ["combat", "sh", 1, 0, 1, 8_000],
  stab: ["combat", "st", 1, 0, 1, 8_000],
  kill: ["combat", "", 1, 0, 1, 10_000],
  destroy: ["combat", "ds", 1, 0, 1, 10_000],
  explode: ["combat", "ex", 1, 0, 1, 10_000],
  poke: ["fun", "", 1, 1, 1, 3_000],
  wave: ["fun", "wv", 0, 0, 1, 3_000],
  highfive: ["fun", "hf", 1, 0, 1, 3_000],
  yeet: ["fun", "", 1, 0, 1, 8_000],
  dance: ["fun", "da", 0, 1, 1, 5_000],
  laugh: ["fun", "lf", 0, 1, 1, 3_000],
  cry: ["fun", "", 0, 1, 1, 5_000],
  blush: ["fun", "", 0, 1, 1, 3_000],
  smug: ["fun", "sm", 0, 1, 1, 3_000],
  panic: ["fun", "pa", 0, 1, 1, 5_000],
  sleep: ["fun", "slp", 0, 1, 1, 5_000],
  celebrate: ["fun", "ce", 0, 1, 1, 5_000],
  roast: ["fun", "ro", 1, 0, 1, 5_000],
  simp: ["fun", "", 1, 0, 1, 5_000],
};

const EXPECTED_ALIAS_UNION = new Set([
  "h", "cu", "hp", "ks", "pu", "kik", "sl", "bn", "bi", "ht", "sk", "th",
  "sh", "st", "ds", "ex", "wv", "hf", "da", "lf", "sm", "pa", "slp", "ce", "ro",
]);

const COMBAT_ACTIONS = [
  "punch", "kick", "slap", "bonk", "bite", "hit", "smack",
  "throw", "shoot", "stab", "kill", "destroy", "explode",
];

/** Blocks any Discord API access outside an explicit allowlist. */
function guarded<T extends object>(label: string, allow: string[], base: T): { proxy: T; accesses: string[] } {
  const accesses: string[] = [];
  const proxy = new Proxy(base, {
    get(t, p, receiver) {
      if (typeof p !== "string") return Reflect.get(t, p, receiver);
      if (p in t) {
        accesses.push(p);
        return Reflect.get(t, p);
      }
      throw new Error(`${label}: unexpected Discord API access -> ${String(p)}`);
    },
  });
  return { proxy, accesses };
}

const failClient: AnimeHttpClient = async () => ({
  ok: false,
  status: 0,
  body: "",
  failure: "network",
});

async function finalMatrixTests(): Promise<void> {
  console.log("\n--- 32-Action Verification Matrix ---");
  const all = getAllActions();

  // M1: exact name set from the canonical 32-action list.
  const expectedNames = Object.keys(EXPECTED_POLICY);
  const actualNames = all.map((a) => a.name).sort();
  const expectedSorted = [...expectedNames].sort();
  if (
    all.length === 32 &&
    actualNames.length === expectedSorted.length &&
    actualNames.every((n, i) => n === expectedSorted[i])
  ) {
    pass("M1 exactly the canonical 32 actions are registered");
  } else {
    fail("M1 exactly the canonical 32 actions are registered", actualNames);
  }

  // M2: per-action policy (category, aliases, target, self, bot, cooldown).
  const policyMismatches: string[] = [];
  for (const action of all) {
    const exp = EXPECTED_POLICY[action.name];
    if (!exp) {
      policyMismatches.push(`${action.name}: unexpected action`);
      continue;
    }
    const [cat, aliases, tr, self, bot, cd] = exp;
    if (action.category !== cat) policyMismatches.push(`${action.name}: category ${action.category} != ${cat}`);
    if (action.aliases.join(",") !== aliases) policyMismatches.push(`${action.name}: aliases [${action.aliases}] != [${aliases}]`);
    if (action.targetRequired !== Boolean(tr)) policyMismatches.push(`${action.name}: targetRequired ${action.targetRequired}`);
    if (action.selfTargetAllowed !== Boolean(self)) policyMismatches.push(`${action.name}: selfTargetAllowed ${action.selfTargetAllowed}`);
    if (action.botTargetAllowed !== Boolean(bot)) policyMismatches.push(`${action.name}: botTargetAllowed ${action.botTargetAllowed}`);
    if (action.cooldownMs !== cd) policyMismatches.push(`${action.name}: cooldown ${action.cooldownMs} != ${cd}`);
    if (!action.description || action.description.trim().length < 5) policyMismatches.push(`${action.name}: missing description`);
    if (action.responses.length < 2) policyMismatches.push(`${action.name}: fewer than 2 responses`);
    if (action.botTargetAllowed && action.botResponses.length < 1) policyMismatches.push(`${action.name}: no botResponses`);
    if (action.selfTargetAllowed && action.selfResponses.length < 1) policyMismatches.push(`${action.name}: no selfResponses`);
    if (action.mediaKey !== action.name) policyMismatches.push(`${action.name}: mediaKey ${action.mediaKey} != name`);
    if (!/^[a-z]+$/.test(action.mediaKey)) policyMismatches.push(`${action.name}: mediaKey format`);
  }
  if (policyMismatches.length === 0) {
    pass("M2 every action matches its full policy row (category/aliases/target/self/bot/cooldown/description/mediaKey)");
  } else {
    fail("M2 every action matches its full policy row", policyMismatches);
  }

  // M3: every alias resolves to exactly one canonical action (identity).
  const aliasMismatches: string[] = [];
  const aliasUnion = new Set<string>();
  for (const action of all) {
    for (const alias of action.aliases) {
      aliasUnion.add(alias);
      if (getAction(alias) !== action) {
        aliasMismatches.push(`${alias} -> ${getAction(alias)?.name} != ${action.name}`);
      }
      if (getAction(alias)?.name !== action.name) aliasMismatches.push(`${alias} not unique to ${action.name}`);
    }
    // Canonical names also resolve to identity.
    if (getAction(action.name) !== action) aliasMismatches.push(`name ${action.name} identity broken`);
  }
  if (
    aliasMismatches.length === 0 &&
    aliasUnion.size === EXPECTED_ALIAS_UNION.size &&
    [...EXPECTED_ALIAS_UNION].every((a) => aliasUnion.has(a))
  ) {
    pass(`M3 all ${aliasUnion.size} aliases resolve to exactly one canonical action`);
  } else {
    fail("M3 alias table complete + unique", { aliasMismatches, got: [...aliasUnion] });
  }

  // M4: no alias is also a canonical name (shadowing would be silent).
  const shadowed = [...aliasUnion].filter((a) => expectedNames.includes(a));
  if (shadowed.length === 0) {
    pass("M4 no alias shadows a canonical action name");
  } else {
    fail("M4 no alias shadows a canonical action name", shadowed);
  }

  // M5: template integrity — resolveResponse never leaks placeholders,
  // in any of the three response modes.
  const templateLeaks: string[] = [];
  for (const action of all) {
    const modes: Array<[string, boolean, boolean]> = [
      ["normal", false, false],
      ...(action.botTargetAllowed ? ([["bot", true, false]] as Array<[string, boolean, boolean]>) : []),
      ...(action.selfTargetAllowed ? ([["self", false, true]] as Array<[string, boolean, boolean]>) : []),
    ];
    for (const [mode, bot, self] of modes) {
      /*
       * Exercise EVERY template deterministically by steering pick()
       * (Math.floor(Math.random() * len)) instead of relying on a
       * single random draw — some bot responses legitimately omit
       * {author} ("AshenAI enjoys the cozy cuddle!"), so the author
       * check is per-template: only templates carrying {author} must
       * render the author name.
       */
      const pool = bot
        ? action.botResponses.length
          ? action.botResponses
          : action.responses
        : self
          ? action.selfResponses.length
            ? action.selfResponses
            : action.responses
          : action.responses;
      for (let i = 0; i < pool.length; i++) {
        const realRandom = Math.random;
        Math.random = () => (i + 0.5) / pool.length;
        let text: string;
        try {
          text = resolveResponse(action, "Alice", bot ? "AshenAI" : "Bob", bot, self).text;
        } finally {
          Math.random = realRandom;
        }
        const tag = `${action.name}/${mode}[${i}]`;
        if (/\{author\}|\{target\}/.test(text)) templateLeaks.push(`${tag}: ${text}`);
        if (!text.trim()) templateLeaks.push(`${tag}: empty`);
        if (pool[i].includes("{author}") && !text.includes("Alice")) {
          templateLeaks.push(`${tag}: author name missing`);
        }
      }
    }
  }
  if (templateLeaks.length === 0) {
    pass("M5 response templates resolve cleanly in normal/bot/self modes (no placeholder leaks)");
  } else {
    fail("M5 response templates resolve cleanly", templateLeaks.slice(0, 5));
  }

  // M6: static template hygiene — {target} only in generic responses.
  const badTemplates: string[] = [];
  for (const action of all) {
    for (const r of action.botResponses) if (r.includes("{target}")) badTemplates.push(`${action.name} bot: {target}`);
    for (const r of action.selfResponses) if (r.includes("{target}")) badTemplates.push(`${action.name} self: {target}`);
    for (const r of action.responses) if (!r.includes("{author}")) badTemplates.push(`${action.name} resp: no {author}`);
  }
  if (badTemplates.length === 0) {
    pass("M6 template hygiene: bot/self responses never interpolate {target}; generic responses carry {author}");
  } else {
    fail("M6 template hygiene", badTemplates);
  }

  // M7: exactly one optional-target action forbids self (wave) — pins
  // the scope of the bare-invocation (targetless) semantics.
  const optionalNoSelf = all.filter((a) => !a.targetRequired && !a.selfTargetAllowed).map((a) => a.name);
  if (optionalNoSelf.length === 1 && optionalNoSelf[0] === "wave") {
    pass("M7 exactly one optional+no-self action (wave) — targetless bare-invocation scope is pinned");
  } else {
    fail("M7 optional+no-self scope", optionalNoSelf);
  }

  // M8: mediaKey uniqueness (provider queries never collide).
  const keys = all.map((a) => a.mediaKey);
  if (new Set(keys).size === 32) {
    pass("M8 32 unique mediaKeys (one provider query per action)");
  } else {
    fail("M8 32 unique mediaKeys", keys.length - new Set(keys).size);
  }
}

async function targetMatrixTests(): Promise<void> {
  console.log("\n--- Target Resolution Matrix (runner seam, no network) ---");
  const runnerCalls: Array<{ name: string; tid: string | null }> = [];
  const runner = async (name: string, _m: Message, tid: string | null) => {
    runnerCalls.push({ name, tid });
    return { text: `EXEC:${name}:${tid ?? "none"}` };
  };
  const execCount = () => runnerCalls.length;
  const lastExec = () => runnerCalls[runnerCalls.length - 1];

  // X1: valid mention → executes with the mentioned id.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash hug <@777777777777777777>", "guild-x", "user-x1", {
      mentionId: "777777777777777777",
    });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === "777777777777777777") {
      pass("X1 valid mention → target");
    } else {
      fail("X1 valid mention → target", { runnerCalls, replies: t.replies });
    }
  }

  // X2: valid reply → target (reply to another user's message).
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash hug", "guild-x", "user-x2", {
      replyTo: { id: "msg-1", authorId: "999999999999999999" },
    });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === "999999999999999999") {
      pass("X2 valid reply → reply author");
    } else {
      fail("X2 valid reply → reply author", { runnerCalls, replies: t.replies });
    }
  }

  // X3: reply-to-self + self-forbidden action → correct self rejection
  // (was a misleading usage error before the reply-to-self fix).
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash punch", "guild-x", "user-x3", {
      replyTo: { id: "msg-2", authorId: "user-x3" },
    });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 0 && t.replies[0]?.includes("on yourself")) {
      pass("X3 reply-to-self + self-forbidden → 'on yourself' reject");
    } else {
      fail("X3 reply-to-self + self-forbidden", { runnerCalls, replies: t.replies });
    }
  }

  // X4: reply-to-self + self-allowed action → executes as self.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash hug", "guild-x", "user-x4", {
      replyTo: { id: "msg-3", authorId: "user-x4" },
    });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === "user-x4") {
      pass("X4 reply-to-self + self-allowed → executes as self");
    } else {
      fail("X4 reply-to-self + self-allowed", { runnerCalls, replies: t.replies });
    }
  }

  // X5: valid raw user id (resolves in this guild) → executes.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash punch 111111111111111111", "guild-x", "user-x5", { guildMode: "plain" });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === "111111111111111111") {
      pass("X5 valid raw user id → target");
    } else {
      fail("X5 valid raw user id → target", { runnerCalls, replies: t.replies });
    }
  }

  // X6: malformed mention token → reject.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash punch <@abc>", "guild-x", "user-x6");
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 0 && t.replies[0]?.includes("can't find that user")) {
      pass("X6 malformed mention token → reject");
    } else {
      fail("X6 malformed mention token → reject", t.replies);
    }
  }

  // X7: raw id of a NON-MEMBER (foreign guild / nonexistent) → reject.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash punch 222222222222222222", "guild-x", "user-x7", { guildMode: "missing" });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 0 && t.replies[0]?.includes("can't find that user")) {
      pass("X7 foreign-guild/nonexistent raw id → reject (never self)");
    } else {
      fail("X7 foreign-guild/nonexistent raw id → reject", t.replies);
    }
  }

  // X8: member fetch throws (inaccessible) → reject (fail closed).
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash punch 333333333333333333", "guild-x", "user-x8", { guildMode: "throws" });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 0 && t.replies[0]?.includes("can't find that user")) {
      pass("X8 inaccessible member fetch → reject (fail closed)");
    } else {
      fail("X8 inaccessible member fetch → reject", t.replies);
    }
  }

  // X9: missing target where required → usage error.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash simp", "guild-x", "user-x9");
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 0 && t.replies[0]?.includes("Who should")) {
      pass("X9 missing target where required → usage");
    } else {
      fail("X9 missing target where required", t.replies);
    }
  }

  // X10: self mention + self-allowed → executes as self.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash hug <@user-x10>", "guild-x", "user-x10", { mentionId: "user-x10" });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === "user-x10") {
      pass("X10 self-target where allowed → self");
    } else {
      fail("X10 self-target where allowed", { runnerCalls, replies: t.replies });
    }
  }

  // X11: self mention + self-forbidden → reject.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash punch <@user-x11>", "guild-x", "user-x11", { mentionId: "user-x11" });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 0 && t.replies[0]?.includes("on yourself")) {
      pass("X11 self-target where forbidden → reject");
    } else {
      fail("X11 self-target where forbidden", t.replies);
    }
  }

  // X12: bot mention → follows bot policy (allowed for all 32) and
  // executes with the bot id — never a moderation path.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash kill <@bot-p23-anime>", "guild-x", "user-x12", {
      mentionId: "bot-p23-anime",
    });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === "bot-p23-anime" && lastExec().name === "kill") {
      pass("X12 bot target → policy allows (all 32) + fictional execution");
    } else {
      fail("X12 bot target", { runnerCalls, replies: t.replies });
    }
  }

  // X13: garbage target on an OPTIONAL + self-allowed action must
  // still reject (never silently self-target).
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash cry @abc", "guild-x", "user-x13");
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 0 && t.replies[0]?.includes("can't find that user")) {
      pass("X13 garbage target on optional+self action → reject (no silent self)");
    } else {
      fail("X13 garbage target on optional+self action", t.replies);
    }
  }

  // X14: bare `ash wave` (optional + self-forbidden) executes
  // TARGETLESS — targetRequired=false stays honorable.
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash wave", "guild-x", "user-x14");
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === null && t.replies[0]?.includes("EXEC:wave:none")) {
      pass("X14 bare 'ash wave' → executes targetless (not a self-target error)");
    } else {
      fail("X14 bare 'ash wave' targetless", { runnerCalls, replies: t.replies });
    }
  }

  // X15: bare optional+self-allowed action → self (unchanged doc flow).
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash cry", "guild-x", "user-x15");
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === "user-x15") {
      pass("X15 bare 'ash cry' → self");
    } else {
      fail("X15 bare 'ash cry' self", { runnerCalls, replies: t.replies });
    }
  }

  // X16: deleted/unreachable reply reference falls through gracefully
  // (optional action still executes per its own semantics).
  runnerCalls.length = 0;
  {
    const t = mkAshMessage("ash wave", "guild-x", "user-x16", { referenceOnly: true });
    await handleAnimeAction(t.msg, p23Client, { runAction: runner });
    if (execCount() === 1 && lastExec().tid === null) {
      pass("X16 deleted reply reference → falls through to targetless (no crash)");
    } else {
      fail("X16 deleted reply reference", { runnerCalls, replies: t.replies });
    }
  }

  // X17: explicit-but-unresolvable NEVER becomes self — required and
  // optional actions share the same fail-closed gate.
  runnerCalls.length = 0;
  {
    const t1 = mkAshMessage("ash kill @abc", "guild-x", "user-x17a");
    const t2 = mkAshMessage("ash celebrate @abc", "guild-x", "user-x17b");
    await handleAnimeAction(t1.msg, p23Client, { runAction: runner });
    await handleAnimeAction(t2.msg, p23Client, { runAction: runner });
    const bothReject =
      t1.replies[0]?.includes("can't find that user") &&
      t2.replies[0]?.includes("can't find that user") &&
      execCount() === 0;
    if (bothReject) {
      pass("X17 explicit-unresolvable rejected on required AND optional actions (never self)");
    } else {
      fail("X17 explicit-unresolvable fail-closed", { r1: t1.replies, r2: t2.replies });
    }
  }
}

async function cooldownSemanticsTests(): Promise<void> {
  console.log("\n--- Cooldown Semantics (per action, before target validation) ---");
  const runner = async (name: string) => ({ text: `EXEC:${name}` });

  // C1: invalid target consumes the cooldown.
  {
    const a = mkAshMessage("ash hug @abc", "guild-c", "user-cd1", {});
    const b = mkAshMessage("ash hug @abc", "guild-c", "user-cd1", {});
    await handleAnimeAction(a.msg, p23Client, { runAction: runner });
    await handleAnimeAction(b.msg, p23Client, { runAction: runner });
    if (a.replies[0]?.includes("can't find") && b.replies[0]?.includes("cooldown")) {
      pass("C1 invalid target consumes the cooldown");
    } else {
      fail("C1 invalid target consumes cooldown", { a: a.replies, b: b.replies });
    }
  }

  // C2: malformed target consumes the cooldown.
  {
    const a = mkAshMessage("ash punch @@@!", "guild-c", "user-cd2", {});
    const b = mkAshMessage("ash punch @@@!", "guild-c", "user-cd2", {});
    await handleAnimeAction(a.msg, p23Client, { runAction: runner });
    await handleAnimeAction(b.msg, p23Client, { runAction: runner });
    if (a.replies[0]?.includes("can't find") && b.replies[0]?.includes("cooldown")) {
      pass("C2 malformed target consumes the cooldown");
    } else {
      fail("C2 malformed target consumes cooldown", { a: a.replies, b: b.replies });
    }
  }

  // C3: successful execution consumes the cooldown.
  {
    const a = mkAshMessage("ash sl <@777777777777777777>", "guild-c", "user-cd3", { mentionId: "777777777777777777" });
    const b = mkAshMessage("ash sl <@777777777777777777>", "guild-c", "user-cd3", { mentionId: "777777777777777777" });
    await handleAnimeAction(a.msg, p23Client, { runAction: runner });
    await handleAnimeAction(b.msg, p23Client, { runAction: runner });
    if (a.replies[0]?.includes("EXEC:slap") && b.replies[0]?.includes("cooldown")) {
      pass("C3 successful action consumes the cooldown (alias path)");
    } else {
      fail("C3 successful action consumes cooldown", { a: a.replies, b: b.replies });
    }
  }

  // C4: unknown actions consume NO cooldown (repeat unknown works).
  {
    const a = mkAshMessage("ash frobnicate", "guild-c", "user-cd4", {});
    const b = mkAshMessage("ash frobnicate", "guild-c", "user-cd4", {});
    await handleAnimeAction(a.msg, p23Client, { runAction: runner });
    await handleAnimeAction(b.msg, p23Client, { runAction: runner });
    if (a.replies[0]?.includes("Unknown action") && b.replies[0]?.includes("Unknown action")) {
      pass("C4 unknown action consumes no cooldown");
    } else {
      fail("C4 unknown action consumes no cooldown", { a: a.replies, b: b.replies });
    }
  }

  // C5: alias and canonical share ONE cooldown key.
  {
    const a = mkAshMessage("ash pu @abc", "guild-c", "user-cd5", {});
    const b = mkAshMessage("ash punch @abc", "guild-c", "user-cd5", {});
    await handleAnimeAction(a.msg, p23Client, { runAction: runner });
    await handleAnimeAction(b.msg, p23Client, { runAction: runner });
    if (b.replies[0]?.includes("cooldown")) {
      pass("C5 alias shares the canonical cooldown key (no alias bypass)");
    } else {
      fail("C5 alias shares cooldown key", { b: b.replies });
    }
  }

  // C6: cooldown behavior is IDENTICAL across all 32 actions —
  // first call executes, second hits the cooldown, fresh user each.
  const cdFailures: string[] = [];
  for (const action of getAllActions()) {
    const uid = `user-cdx-${action.name}`;
    const first = mkAshMessage(`ash ${action.name} <@777777777777777777>`, null, uid, {
      mentionId: "777777777777777777",
    });
    const second = mkAshMessage(`ash ${action.name} <@777777777777777777>`, null, uid, {
      mentionId: "777777777777777777",
    });
    await handleAnimeAction(first.msg, p23Client, { runAction: runner });
    await handleAnimeAction(second.msg, p23Client, { runAction: runner });
    const ok =
      first.replies[0]?.includes(`EXEC:${action.name}`) &&
      second.replies[0]?.includes("cooldown");
    if (!ok) cdFailures.push(`${action.name}: first=${first.replies[0]} second=${second.replies[0]}`);
  }
  if (cdFailures.length === 0) {
    pass("C6 all 32 actions: execute once, then cooldown (consistent semantics)");
  } else {
    fail("C6 all 32 cooldown parity", cdFailures);
  }

  // C7: static ordering — rate limit → flag gate → cooldown →
  // target resolution → engine.
  try {
    const src = fs.readFileSync(path.resolve("src/games/anime-actions/prefix-handler.ts"), "utf8");
    const rate = src.indexOf("actionRateLimiter.check");
    const flag = src.indexOf("flag === undefined || flag === null");
    const cd = src.indexOf("const cooldown = checkCooldown(");
    const resolve = src.indexOf("await resolveTarget(");
    const engine = src.indexOf("const runner = deps.runAction ?? executeAction");
    if (rate >= 0 && flag > rate && cd > flag && resolve > cd && engine > resolve) {
      pass("C7 static order: rate → flag → cooldown → resolve → engine");
    } else {
      fail("C7 static order", { rate, flag, cd, resolve, engine });
    }
  } catch (e) {
    fail("C7 static order", e);
  }
}

async function flagStateTests(): Promise<void> {
  console.log("\n--- Guild Toggle: every state ---");
  const gateReplies = async (
    label: string,
    loadConfig: () => unknown,
    content = "ash frobnicate",
    guild: string | null = "guild-flag-state",
    userId = `user-flag-${label}`,
  ): Promise<string> => {
    const t = mkAshMessage(content, guild, userId);
    await handleAnimeAction(t.msg, p23Client, { loadConfig: loadConfig as never });
    return t.replies[0] ?? "";
  };

  const opened = (r: string) => r.includes("Unknown action");
  const closed = (r: string) => r.includes("disabled in this server");

  const cases: Array<[string, () => unknown, boolean]> = [
    ["true → allowed", () => ({ social: { animeActions: true } }), true],
    ["false → denied", () => ({ social: { animeActions: false } }), false],
    ["undefined flag → default ON", () => ({ social: {} }), true],
    ["null flag → default ON", () => ({ social: { animeActions: null } }), true],
    ["missing social section → default ON", () => ({}), true],
    ["missing config object → default ON", () => undefined, true],
    ["corrupt string 'false' → fail CLOSED", () => ({ social: { animeActions: "false" } }), false],
    ["corrupt string 'true' → fail CLOSED (strict)", () => ({ social: { animeActions: "true" } }), false],
    ["corrupt number 1 → fail CLOSED", () => ({ social: { animeActions: 1 } }), false],
  ];
  const flagFailures: string[] = [];
  for (const [label, load, expectOpen] of cases) {
    const reply = await gateReplies(label.replace(/\W+/g, "-"), load as never);
    const ok = expectOpen ? opened(reply) : closed(reply);
    if (!ok) flagFailures.push(`${label}: got "${reply.slice(0, 80)}"`);
  }
  if (flagFailures.length === 0) {
    pass(`G1 all ${cases.length} flag states match the documented posture (fail closed on corrupt/error)`);
  } else {
    fail("G1 flag states", flagFailures);
  }

  // G2: config read exception → fail closed.
  const throwReply = await gateReplies("throws", () => {
    throw new Error("db down");
  });
  if (closed(throwReply)) {
    pass("G2 config exception → fail closed");
  } else {
    fail("G2 config exception → fail closed", throwReply);
  }

  // G3: help, malformed input, aliases and raw ids all stay behind
  // the disabled gate (no bypass paths).
  const bypassInputs: Array<[string, string]> = [
    ["bare help", "ash"],
    ["help alias", "ash actions"],
    ["alias action", "ash h"],
    ["malformed/mention abuse", "ash @everyone"],
    ["raw id target", "ash punch 111111111111111111"],
    ["reply-style (no target)", "ash kill"],
  ];
  const bypassFailures: string[] = [];
  for (const [label, content] of bypassInputs) {
    const reply = await gateReplies(label.replace(/\W+/g, "-"), () => ({ social: { animeActions: false } }), content);
    if (!closed(reply)) bypassFailures.push(`${label}: ${reply.slice(0, 60)}`);
  }
  if (bypassFailures.length === 0) {
    pass(`G3 disabled gate covers help/alias/malformed/raw-id paths (${bypassInputs.length} inputs)`);
  } else {
    fail("G3 no disabled-gate bypass", bypassFailures);
  }

  // G4: DMs (no guild) remain enabled by design.
  const dmReply = await gateReplies("dm", () => ({ social: { animeActions: false } }), "ash frobnicate", null);
  if (opened(dmReply)) {
    pass("G4 DM has no guild config → enabled (documented)");
  } else {
    fail("G4 DM enabled", dmReply);
  }

  // G5: concurrent requests read the config independently and
  // consistently (no torn reads).
  let reads = 0;
  const concReplies = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      gateReplies(
        `conc-${i}`,
        () => {
          reads++;
          return { social: { animeActions: true } };
        },
        "ash frobnicate",
        "guild-flag-concurrent",
        `user-flag-conc-${i}`,
      ),
    ),
  );
  if (reads === 8 && concReplies.every((r) => opened(r))) {
    pass("G5 8 concurrent flag reads → consistent, one read per request");
  } else {
    fail("G5 concurrent flag reads", { reads, concReplies: concReplies.map((r) => r.slice(0, 40)) });
  }
}

async function providerCacheTests(): Promise<void> {
  console.log("\n--- Providers, Fallback, Cache ---");

  // P1: provider A fails → provider B supplies the URL.
  clearAnimationCache();
  {
    const client: AnimeHttpClient = async (req) => {
      if (req.url.includes("gifukai")) return { ok: false, status: 0, body: "", failure: "network" };
      return { ok: true, status: 200, body: JSON.stringify({ url: "https://media.example.com/b.gif" }) };
    };
    const r = await fetchAnimation("hug", { httpClient: client });
    if (r && r.source === "otakugifs" && r.url === "https://media.example.com/b.gif") {
      pass("P1 provider A fails → fallback to provider B");
    } else {
      fail("P1 provider fallback", r);
    }
  }

  // P2: both providers fail → null (text fallback upstream), no cache.
  clearAnimationCache();
  {
    const r = await fetchAnimation("punch", { httpClient: failClient });
    const stats = getAnimationCacheStats();
    if (r === null && stats.size === 0) {
      pass("P2 both providers fail → null + nothing cached");
    } else {
      fail("P2 both providers fail", { r, stats });
    }
  }

  // P3: malformed JSON → no cache, no throw.
  clearAnimationCache();
  {
    const client: AnimeHttpClient = async () => ({ ok: true, status: 200, body: "<html>not json" });
    const r = await fetchAnimation("slap", { httpClient: client });
    if (r === null && getAnimationCacheStats().size === 0) {
      pass("P3 malformed provider JSON → null, not cached");
    } else {
      fail("P3 malformed JSON", { r, stats: getAnimationCacheStats() });
    }
  }

  // P4: timeout failure → null, not cached.
  clearAnimationCache();
  {
    const client: AnimeHttpClient = async () => ({ ok: false, status: 0, body: "", failure: "timeout" });
    const r = await fetchAnimation("kick", { httpClient: client });
    if (r === null && getAnimationCacheStats().size === 0) {
      pass("P4 provider timeout → null, not cached");
    } else {
      fail("P4 provider timeout", r);
    }
  }

  // P5: provider returns an INTERNAL url → validation rejects, no cache
  // (cache poisoning blocked).
  clearAnimationCache();
  {
    const client: AnimeHttpClient = async () => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ url: "http://10.0.0.1/evil.gif" }),
    });
    const r = await fetchAnimation("bite", { httpClient: client });
    if (r === null && getAnimationCacheStats().size === 0) {
      pass("P5 invalid/internal provider URL → rejected before cache (no poisoning)");
    } else {
      fail("P5 invalid URL not cached", { r, stats: getAnimationCacheStats() });
    }
  }

  // P6: empty/invalid payload ({} and oversized URL) → null, no cache.
  clearAnimationCache();
  {
    const emptyClient: AnimeHttpClient = async () => ({ ok: true, status: 200, body: "{}" });
    const bigClient: AnimeHttpClient = async () => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ url: `https://media.example.com/${"a".repeat(3000)}` }),
    });
    const r1 = await fetchAnimation("hit", { httpClient: emptyClient });
    const r2 = await fetchAnimation("smack", { httpClient: bigClient });
    if (r1 === null && r2 === null && getAnimationCacheStats().size === 0) {
      pass("P6 empty payload + oversized URL → null, not cached");
    } else {
      fail("P6 empty/oversized payload", { r1, r2 });
    }
  }

  // P7: provider "too_large" failure → null, no throw.
  clearAnimationCache();
  {
    const client: AnimeHttpClient = async () => ({ ok: false, status: 0, body: "", failure: "too_large" });
    const r = await fetchAnimation("bonk", { httpClient: client });
    if (r === null) {
      pass("P7 oversized provider response → null");
    } else {
      fail("P7 oversized provider response", r);
    }
  }

  // P8: no infinite retry — exactly one call per provider (2 total)
  // when everything fails.
  clearAnimationCache();
  {
    let calls = 0;
    const counting: AnimeHttpClient = async () => {
      calls++;
      return { ok: false, status: 0, body: "", failure: "network" };
    };
    await fetchAnimation("throw", { httpClient: counting });
    if (calls === 2) {
      pass("P8 provider chain attempts each provider exactly once (no retry loop)");
    } else {
      fail("P8 no retry loop", calls);
    }
  }

  // P9: successes are cached; a cache hit performs ZERO provider calls.
  clearAnimationCache();
  {
    const okClient: AnimeHttpClient = async () => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ url: "https://media.example.com/cache.gif" }),
    });
    await fetchAnimation("kiss", { httpClient: okClient });
    const before = getAnimationCacheStats().requests;
    const exploding: AnimeHttpClient = async () => {
      throw new Error("provider called despite cache hit");
    };
    const hit = await fetchAnimation("kiss", { httpClient: exploding });
    const after = getAnimationCacheStats().requests;
    if (hit && hit.url === "https://media.example.com/cache.gif" && after === before) {
      pass("P9 cache hit → zero provider calls (bounded, no duplicate fetches)");
    } else {
      fail("P9 cache hit isolation", { hit, before, after });
    }
  }

  // P10: cache is shared per mediaKey regardless of guild/user/how the
  // action was invoked (no per-guild duplication, no alias duplication).
  clearAnimationCache();
  {
    const okClient: AnimeHttpClient = async () => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ url: "https://media.example.com/one.gif" }),
    });
    // Two "guilds" invoke the same action; aliases map to the same
    // mediaKey by identity (M3), so a single cache entry serves all.
    await fetchAnimation(getAction("pu")!.mediaKey, { httpClient: okClient });
    const requestsAfterFirst = getAnimationCacheStats().requests;
    await fetchAnimation(getAction("punch")!.mediaKey, { httpClient: okClient });
    const stats = getAnimationCacheStats();
    if (stats.size === 1 && stats.requests === requestsAfterFirst) {
      pass("P10 alias/canonical share one cache key; cache bounded to mediaKey space");
    } else {
      fail("P10 cache key sharing", stats);
    }
  }

  // P11: engine never surfaces provider content into the reply TEXT
  // (URL travels only via the attachment field).
  {
    const okClient: AnimeHttpClient = async () => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ url: "https://media.example.com/secret-provider.gif" }),
    });
    clearAnimationCache();
    const msg = {
      author: { id: "user-engine-r4", username: "tester" },
      member: { displayName: "Tester" },
      guild: { id: "guild-e", members: { fetch: async (id: string) => ({ id, displayName: "Target" }) } },
    } as unknown as Message;
    const result = await executeAction("hug", msg, "777777777777777777", "bot-x", { httpClient: okClient });
    const textLeaks =
      result?.text.includes("media.example.com") || result?.text.includes("secret-provider");
    if (result && result.animationUrl === "https://media.example.com/secret-provider.gif" && !textLeaks) {
      pass("P11 provider URL never appears in reply text (attachment field only)");
    } else {
      fail("P11 provider content isolated from text", result);
    }
  }
}

async function engineBoundaryTests(): Promise<void> {
  console.log("\n--- Engine Runtime Boundary + Failure Behavior ---");

  const mkEngineMsg = (authorId: string): { base: any; accesses: string[]; proxy: Message } => {
    const base: any = {
      author: { id: authorId, username: "tester" },
      member: { displayName: "Tester" },
      guild: {
        id: "guild-engine",
        members: { fetch: async (id: string) => ({ id, displayName: "TargetUser" }) },
      },
    };
    const { proxy, accesses } = guarded<Message>("engine", [], base);
    return { base, accesses, proxy };
  };

  // E1: engine executes ALL combat actions with a moderation-API
  // blocking proxy + injected failing providers → no unexpected
  // Discord API access, no throw, text-only result.
  const engineFailures: string[] = [];
  for (const name of COMBAT_ACTIONS) {
    clearAnimationCache();
    const { proxy, accesses } = mkEngineMsg(`user-eng-${name}`);
    try {
      const result = await executeAction(name, proxy, "777777777777777777", "bot-eng", {
        httpClient: failClient,
      });
      if (!result || !result.text.trim() || result.animationUrl) {
        engineFailures.push(`${name}: bad result ${JSON.stringify(result)}`);
      }
      // Same exemption as B2: the action's own name/aliases are
      // expected inside its own fictional copy.
      const actionDef = getAction(name);
      const banned = ["ban", "timeout", "kick", "purge", "mute", "delete"].filter(
        (w) => w !== name && !(actionDef?.aliases.includes(w) ?? false) && w !== (actionDef?.emoteName ?? ""),
      );
      const bannedWords = new RegExp(`\\b(${banned.join("|")})\\b`, "i").test(result?.text ?? "");
      if (bannedWords) engineFailures.push(`${name}: moderation wording in text`);
    } catch (e) {
      engineFailures.push(`${name}: threw ${e instanceof Error ? e.message : e}`);
    }
    if (accesses.some((a) => !["author", "member", "guild", "guild.id", "guild.members", "guild.members.fetch"].includes(a) && a !== "fetch")) {
      engineFailures.push(`${name}: unexpected access ${accesses.join(",")}`);
    }
  }
  if (engineFailures.length === 0) {
    pass(`E1 engine runs all ${COMBAT_ACTIONS.length} combat actions under a Discord-API guard (zero moderation calls)`);
  } else {
    fail("E1 engine combat guard", engineFailures);
  }

  // E2: `ash kill` engine path specifically (mission §10).
  clearAnimationCache();
  {
    const { proxy } = mkEngineMsg("user-eng-kill");
    const result = await executeAction("kill", proxy, "777777777777777777", "bot-eng", {
      httpClient: failClient,
    });
    if (result && result.text.includes("Tester") && /\b(kills?|KO|final blow|defeats?)\b/i.test(result.text)) {
      pass("E2 'kill' stays a fictional anime reaction in engine output");
    } else {
      fail("E2 'kill' fictional output", result);
    }
  }

  // E3: provider failure inside the engine degrades to text (no throw,
  // no animationUrl) — graceful fallback.
  clearAnimationCache();
  {
    const { proxy } = mkEngineMsg("user-eng-e3");
    const result = await executeAction("explode", proxy, "777777777777777777", "bot-eng", {
      httpClient: failClient,
    });
    if (result && !result.animationUrl && result.text.trim()) {
      pass("E3 provider failure → graceful text-only engine result");
    } else {
      fail("E3 provider failure graceful", result);
    }
  }

  // E4: buildDiscordResponse rejects an insecure URL without any
  // network call (URL gate before fetch).
  {
    const reply = await buildDiscordResponse({
      text: "fallback text",
      animationUrl: "http://insecure.example.com/x.gif",
      animationSource: "test",
    });
    if (reply.content === "fallback text" && !reply.files) {
      pass("E4 insecure animation URL → text fallback, no fetch attempted");
    } else {
      fail("E4 insecure URL fallback", reply);
    }
  }

  // E5: author displayName flows into engine text (documents why the
  // handler must suppress mentions — proved next in R-section).
  clearAnimationCache();
  {
    const msg = {
      author: { id: "user-eng-e5", username: "tester" },
      member: { displayName: "@everyone" },
      guild: { id: "guild-e5", members: { fetch: async (id: string) => ({ id, displayName: "<@&42>" }) } },
    } as unknown as Message;
    const result = await executeAction("dance", msg, "777777777777777777", "bot-x", {
      httpClient: failClient,
    });
    if (result && result.text.includes("@everyone")) {
      pass("E5 malicious displayName reaches engine text (mention suppression required downstream)");
    } else {
      fail("E5 displayName injection surface", result);
    }
  }
}

async function mentionSafetyTests(): Promise<void> {
  console.log("\n--- Mass-Mention Safety ---");

  // R1: hostile display names/content in every reply kind still carry
  // allowedMentions { parse: [] }.
  const payloadBodies: string[] = [];
  const parseOk: boolean[] = [];

  const collect = (t: { raw: any[] }) => {
    const p = t.raw[0];
    payloadBodies.push(typeof p === "string" ? p : (p?.content ?? ""));
    parseOk.push(JSON.stringify(p?.allowedMentions?.parse) === "[]");
  };

  // help
  const tHelp = mkAshMessage("ash", null, "user-r1-help");
  await handleAnimeAction(tHelp.msg, p23Client);
  collect(tHelp);
  // disabled
  const tDis = mkAshMessage("ash hug", "guild-r1", "user-r1-dis", {});
  await handleAnimeAction(tDis.msg, p23Client, { loadConfig: () => ({ social: { animeActions: false } }) as never });
  collect(tDis);
  // unknown action echoing user text
  const tUnk = mkAshMessage("ash <@everyone>-thing", null, "user-r1-unk");
  await handleAnimeAction(tUnk.msg, p23Client);
  collect(tUnk);
  // reject
  const tRej = mkAshMessage("ash punch @abc", null, "user-r1-rej");
  await handleAnimeAction(tRej.msg, p23Client);
  collect(tRej);
  // success with hostile runner text (engine output simulation)
  const tOk = mkAshMessage("ash dance", null, "user-r1-ok");
  await handleAnimeAction(tOk.msg, p23Client, {
    runAction: async () => ({ text: "@everyone @here <@&123> <@123456789012345678> EXEC" }),
  });
  collect(tOk);

  if (parseOk.length === 5 && parseOk.every(Boolean) && payloadBodies[4].includes("@everyone")) {
    pass("R1 all reply kinds (help/disabled/unknown/reject/success) suppress mention parsing");
  } else {
    fail("R1 reply mention suppression", { parseOk, payloadBodies: payloadBodies.map((b) => b.slice(0, 50)) });
  }

  // R2: single reply choke point — the ONLY .reply( in the handler
  // lives inside safeReply.
  try {
    const src = fs.readFileSync(path.resolve("src/games/anime-actions/prefix-handler.ts"), "utf8");
    const replyCalls = src.match(/\.reply\(/g) ?? [];
    const safeReplyDefs = src.match(/async function safeReply/g) ?? [];
    if (replyCalls.length === 1 && safeReplyDefs.length === 1 && src.includes("allowedMentions: { parse: [] }")) {
      pass("R2 single .reply( choke point inside safeReply with parse:[]");
    } else {
      fail("R2 single reply choke", { replyCalls: replyCalls.length, safeReplyDefs: safeReplyDefs.length });
    }
  } catch (e) {
    fail("R2 single reply choke", e);
  }
}

async function moderationSpyTests(): Promise<void> {
  console.log("\n--- Fictional/Moderation Boundary (runtime spy) ---");

  const spyExecs: string[] = [];
  const runner = async (name: string) => {
    spyExecs.push(name);
    return { text: `EXEC:${name}` };
  };

  // W1: message-level guard — ANY Discord API access outside the
  // handler's allowlist throws and fails the test.
  const base: any = {
    content: "",
    guildId: "guild-w",
    author: { id: "user-w", username: "tester" },
    mentions: { users: { size: 1, first: () => ({ id: "777777777777777777" }), has: () => true } },
    member: undefined,
    reference: undefined,
    channel: undefined,
    guild: {
      id: "guild-w",
      members: { fetch: async (id: string) => ({ id, displayName: "Target" }) },
    },
    reply: async (payload: unknown) => {
      (base.__replies ||= []).push(payload);
    },
  };

  // W2: all combat actions run through the guarded message handler.
  const wFailures: string[] = [];
  for (const name of COMBAT_ACTIONS) {
    base.__replies = [];
    const msg = { ...base, content: `ash ${name} <@777777777777777777>` } as any;
    const { proxy, accesses } = guarded<Message>(`handler:${name}`, [], msg);
    const uid = `user-w-${name}`;
    (proxy as any).author = { id: uid, username: "tester" };
    try {
      await handleAnimeAction(proxy, p23Client, { runAction: runner });
    } catch (e) {
      wFailures.push(`${name}: ${e instanceof Error ? e.message : e}`);
    }
    if (!spyExecs.includes(name)) wFailures.push(`${name}: never executed`);
    const allowed = ["content", "guildId", "author", "mentions", "reference", "channel", "guild", "member", "reply"];
    const bad = accesses.filter((a) => !allowed.includes(a));
    if (bad.length > 0) wFailures.push(`${name}: unexpected access ${bad.join(",")}`);
  }
  if (wFailures.length === 0) {
    pass(`W1 all ${COMBAT_ACTIONS.length} combat actions execute under guarded handler (zero moderation APIs touched)`);
  } else {
    fail("W1 guarded handler combat loop", wFailures);
  }

  if (spyExecs.includes("kill")) {
    pass("W2 'kill' executed as a fictional action through the production handler path");
  } else {
    fail("W2 'kill' fictional handler execution");
  }

  // W3: static — no moderation/commands imports anywhere in the system.
  try {
    const files = ["definitions.ts", "engine.ts", "index.ts", "media-security.ts", "prefix-handler.ts", "providers.ts"];
    const banned = [
      /from\s+"[^"]*\/moderation\//,
      /from\s+"[^"]*commands\//,
      /from\s+"[^"]*automod/,
      /\.timeout\s*\(/,
      /\.\s*ban\s*\(/,
      /\.\s*kick\s*\(/,
      /bulkDelete\s*\(/,
      /purge\s*\(/,
      /moderationConfirm|moderationExecutor/i,
    ];
    const hits: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(path.resolve(`src/games/anime-actions/${f}`), "utf8");
      for (const pattern of banned) if (pattern.test(text)) hits.push(`${f}: ${pattern}`);
    }
    if (hits.length === 0) {
      pass("W3 static: zero moderation/command imports or calls in the Ash system");
    } else {
      fail("W3 static moderation scan", hits);
    }
  } catch (e) {
    fail("W3 static moderation scan", e);
  }

  // W4: bot-target refuse branch still exists for future policies
  // (currently all 32 allow bot targets — documented policy).
  try {
    const src = fs.readFileSync(path.resolve("src/games/anime-actions/prefix-handler.ts"), "utf8");
    const allAllowBot = getAllActions().every((a) => a.botTargetAllowed);
    if (src.includes("AshenAI refuses to be a target") && allAllowBot) {
      pass("W4 bot-refuse guard present (defense-in-depth); policy: all 32 allow bot targets");
    } else {
      fail("W4 bot-refuse guard", { allAllowBot });
    }
  } catch (e) {
    fail("W4 bot-refuse guard", e);
  }
}

async function botPolicyTests(): Promise<void> {
  console.log("\n--- Bot Target Policy ---");
  const all = getAllActions();

  // B1: uniform policy — all 32 allow bot targets, all have responses.
  const notAllowed = all.filter((a) => !a.botTargetAllowed).map((a) => a.name);
  const noBotText = all.filter((a) => a.botResponses.length === 0).map((a) => a.name);
  if (notAllowed.length === 0 && noBotText.length === 0) {
    pass("B1 policy: all 32 actions allow bot targets and carry botResponses (intentional, documented)");
  } else {
    fail("B1 bot policy uniformity", { notAllowed, noBotText });
  }

  // B2: bot-target text is fictional/social for every action.
  // Checked across ALL botResponse templates (deterministic — no
  // random draw). The action's own name/aliases are exempt — `kick`'s
  // copy legitimately contains "kick"; only cross-context moderation
  // verbs (e.g. "AshenAI kicks you from the server") are failures.
  const MOD_VERBS = ["ban", "timeout", "kick", "purge", "mute", "delete"];
  const violent: string[] = [];
  for (const a of all) {
    for (const [i, tmpl] of a.botResponses.entries()) {
      const text = tmpl.replace(/\{author\}/g, "Alice").replace(/\{target\}/g, "AshenAI");
      const banned = MOD_VERBS.filter(
        (w) => w !== a.name && !a.aliases.includes(w) && w !== a.emoteName,
      );
      const re = new RegExp(`\\b(${banned.join("|")})\\b`, "i");
      if (re.test(text)) violent.push(`${a.name}[${i}]: ${text}`);
    }
    // Also resolve one real draw so resolveResponse itself is covered.
    const { text } = resolveResponse(a, "Alice", "AshenAI", true, false);
    const bannedAll = MOD_VERBS.filter(
      (w) => w !== a.name && !a.aliases.includes(w) && w !== a.emoteName,
    );
    if (new RegExp(`\\b(${bannedAll.join("|")})\\b`, "i").test(text)) {
      violent.push(`${a.name}: ${text}`);
    }
  }
  if (violent.length === 0) {
    pass("B2 bot-target responses contain zero moderation language across all 32");
  } else {
    fail("B2 bot-target fictional language", violent);
  }

  // B3: no selfResponses exist for self-forbidden actions (definition
  // coherence).
  const stray = all.filter((a) => !a.selfTargetAllowed && a.selfResponses.length > 0).map((a) => a.name);
  if (stray.length === 0) {
    pass("B3 self-forbidden actions define no selfResponses (coherent definitions)");
  } else {
    fail("B3 definition coherence", stray);
  }
}

async function concurrencyRestartTests(): Promise<void> {
  console.log("\n--- Concurrency + Restart ---");

  // K1: same user + same action simultaneously → exactly one executes.
  {
    let runs = 0;
    const runner = async () => {
      runs++;
      return { text: "EXEC" };
    };
    const u = "user-k1";
    const a = mkAshMessage("ash hug <@777777777777777777>", null, u, { mentionId: "777777777777777777" });
    const b = mkAshMessage("ash hug <@777777777777777777>", null, u, { mentionId: "777777777777777777" });
    await Promise.all([
      handleAnimeAction(a.msg, p23Client, { runAction: runner }),
      handleAnimeAction(b.msg, p23Client, { runAction: runner }),
    ]);
    const cooldownReplies = [...a.replies, ...b.replies].filter((r) => r.includes("cooldown")).length;
    if (runs === 1 && cooldownReplies === 1) {
      pass("K1 same user+action concurrent → one execution, one cooldown reject (no race)");
    } else {
      fail("K1 same user+action concurrency", { runs, cooldownReplies });
    }
  }

  // K2: same user, different actions → both execute.
  {
    let runs = 0;
    const runner = async () => {
      runs++;
      return { text: "EXEC" };
    };
    const u = "user-k2";
    const a = mkAshMessage("ash hug <@777777777777777777>", null, u, { mentionId: "777777777777777777" });
    const b = mkAshMessage("ash kiss <@777777777777777777>", null, u, { mentionId: "777777777777777777" });
    await Promise.all([
      handleAnimeAction(a.msg, p23Client, { runAction: runner }),
      handleAnimeAction(b.msg, p23Client, { runAction: runner }),
    ]);
    if (runs === 2) {
      pass("K2 same user, different actions → both execute");
    } else {
      fail("K2 different actions concurrency", runs);
    }
  }

  // K3: different users, same action → both execute (per-user keys).
  {
    let runs = 0;
    const runner = async () => {
      runs++;
      return { text: "EXEC" };
    };
    const a = mkAshMessage("ash slap <@777777777777777777>", null, "user-k3a", { mentionId: "777777777777777777" });
    const b = mkAshMessage("ash slap <@777777777777777777>", null, "user-k3b", { mentionId: "777777777777777777" });
    await Promise.all([
      handleAnimeAction(a.msg, p23Client, { runAction: runner }),
      handleAnimeAction(b.msg, p23Client, { runAction: runner }),
    ]);
    if (runs === 2) {
      pass("K3 different users, same action → both execute");
    } else {
      fail("K3 multi-user concurrency", runs);
    }
  }

  // K4: many users targeting the same user concurrently → all run
  // (no shared-state corruption, bounded by per-user limits).
  {
    let runs = 0;
    const runner = async () => {
      runs++;
      return { text: "EXEC" };
    };
    const calls = Array.from({ length: 5 }, (_, i) => {
      const t = mkAshMessage("ash bonk <@777777777777777777>", null, `user-k4-${i}`, {
        mentionId: "777777777777777777",
      });
      return handleAnimeAction(t.msg, p23Client, { runAction: runner });
    });
    await Promise.all(calls);
    if (runs === 5) {
      pass("K4 5 users → same target concurrently → 5 executions, no corruption");
    } else {
      fail("K4 same-target flood", runs);
    }
  }

  // K5: provider failure under concurrency → deterministic, bounded
  // (2 provider calls per attempt, no crash).
  clearAnimationCache();
  {
    let calls = 0;
    const client: AnimeHttpClient = async () => {
      calls++;
      return { ok: false, status: 0, body: "", failure: "network" };
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => fetchAnimation("pat", { httpClient: client })),
    );
    if (results.every((r) => r === null) && calls === 10) {
      pass("K5 5 concurrent provider failures → all null, exactly 2 calls each (no flood)");
    } else {
      fail("K5 provider failure concurrency", { calls, results });
    }
  }

  // R1: animeActions=false persists across a simulated restart
  // (cache invalidated → fresh DB read) and survives in the raw row.
  const restartGuild = "guild-restart-anime";
  try {
    const cfg: any = { ...loadGuildConfig(restartGuild) };
    cfg.social = {
      enabled: true,
      animeActions: false,
      channels: {},
      customReactions: false,
      customEmoji: false,
      rivalryMode: false,
      debateMode: false,
      globalCooldownMs: 30000,
      maxResponsesPerHour: 10,
    };
    saveGuildConfig(cfg);

    // In-process read.
    if (loadGuildConfig(restartGuild).social?.animeActions !== false) {
      fail("R1 restart: saved false readable", loadGuildConfig(restartGuild).social);
    }

    // Simulated restart: drop the cache, read fresh from SQLite.
    invalidateGuildConfigCache(restartGuild);
    const fresh = loadGuildConfig(restartGuild);
    const row = getDatabase()
      .prepare("SELECT config_json FROM guild_configs WHERE guild_id = ?")
      .get(restartGuild) as { config_json: string } | undefined;
    const rawFlag = row ? JSON.parse(row.config_json)?.social?.animeActions : "ROW_MISSING";

    if (fresh.social?.animeActions === false && rawFlag === false) {
      pass("R1 animeActions=false survives restart (fresh load + raw SQLite row)");
    } else {
      fail("R1 animeActions=false survives restart", { fresh: fresh.social?.animeActions, rawFlag });
    }

    // Handler enforces the persisted flag on a fresh-read path.
    const t = mkAshMessage("ash frobnicate", restartGuild, "user-r1-restart");
    await handleAnimeAction(t.msg, p23Client);
    if (t.replies[0]?.includes("disabled in this server")) {
      pass("R2 handler honors persisted flag after cache invalidation");
    } else {
      fail("R2 handler honors persisted flag after restart", t.replies);
    }

    // Definitions/provider config are code — intact regardless of DB state.
    const providersOk = buildProviders().map((p) => p.name).join(",") === "gifukai,otakugifs";
    if (getAllActions().length === 32 && providersOk) {
      pass("R3 action definitions + provider chain intact (code-owned, restart-proof)");
    } else {
      fail("R3 definitions/providers intact", { actions: getAllActions().length, providersOk });
    }
  } finally {
    deleteGuildConfig(restartGuild);
    invalidateGuildConfigCache(restartGuild);
  }

  // R4: missing config row → default posture (feature ON, documented).
  const missingGuild = "guild-never-saved-anime";
  deleteGuildConfig(missingGuild);
  invalidateGuildConfigCache(missingGuild);
  const t4 = mkAshMessage("ash frobnicate", missingGuild, "user-r4-default");
  await handleAnimeAction(t4.msg, p23Client);
  if (t4.replies[0]?.includes("Unknown action")) {
    pass("R4 no stored config → documented default (enabled)");
  } else {
    fail("R4 default posture on missing config", t4.replies);
  }
}

async function rateLimitTests(): Promise<void> {
  console.log("\n--- Rate Limit Semantics (15/60s per user, global) ---");

  // L1: static — the key is the USER id only (documented global scope).
  try {
    const src = fs.readFileSync(path.resolve("src/games/anime-actions/prefix-handler.ts"), "utf8");
    const m = src.match(/actionRateLimiter\.check\(([^)]*)\)/);
    if (m && m[1] === "message.author.id") {
      pass("L1 rate-limit key = user id only (global across guilds + DMs, documented)");
    } else {
      fail("L1 rate-limit key", m?.[1]);
    }
  } catch (e) {
    fail("L1 rate-limit key", e);
  }

  // L2: Scenario A — spam in one context trips the limit at #16.
  {
    const u = "user-rate-a";
    let slowed = false;
    let allowedCount = 0;
    for (let i = 0; i < 16; i++) {
      const t = mkAshMessage("ash frobnicate", null, u);
      await handleAnimeAction(t.msg, p23Client);
      if (t.replies[0]?.includes("Slow down")) slowed = true;
      else allowedCount++;
    }
    if (slowed && allowedCount === 15) {
      pass("L2 scenario A: spam → exactly 15 allowed, 16th rate-limited");
    } else {
      fail("L2 scenario A spam", { slowed, allowedCount });
    }
  }

  // L3: Scenario B — DM budget and guild budget are the SAME budget.
  {
    const u = "user-rate-b";
    for (let i = 0; i < 15; i++) {
      const t = mkAshMessage("ash frobnicate", null, u);
      await handleAnimeAction(t.msg, p23Client);
    }
    const guildTry = mkAshMessage("ash frobnicate", "guild-rate-b", u);
    await handleAnimeAction(guildTry.msg, p23Client);
    if (guildTry.replies[0]?.includes("Slow down")) {
      pass("L3 scenario B: budget is global per-user (DM spend blocks guild use)");
    } else {
      fail("L3 scenario B cross-context", guildTry.replies);
    }
  }

  // L4: Scenario C — varying targets/actions cannot dodge the budget
  // (15 distinct actions, then #16 rejected).
  {
    const u = "user-rate-c";
    const names = getAllActions().map((a) => a.name).slice(0, 15);
    let executed = 0;
    for (const name of names) {
      const t = mkAshMessage(`ash ${name} <@777777777777777777>`, null, u, { mentionId: "777777777777777777" });
      await handleAnimeAction(t.msg, p23Client, {
        runAction: async () => ({ text: "EXEC" }),
      });
      if (t.replies[0]?.includes("EXEC")) executed++;
    }
    const final = mkAshMessage("ash frobnicate", null, u);
    await handleAnimeAction(final.msg, p23Client);
    if (executed === 15 && final.replies[0]?.includes("Slow down")) {
      pass("L4 scenario C: rotating actions/targets still capped at 15/60s");
    } else {
      fail("L4 scenario C rotation", { executed, final: final.replies });
    }
  }

  // L5: Scenario D — alias cycling shares both cooldown (C5) and the
  // rate budget (aliases are plain messages through the same limiter).
  {
    const u = "user-rate-d";
    const first = mkAshMessage("ash h @abc", null, u);
    await handleAnimeAction(first.msg, p23Client);
    const second = mkAshMessage("ash hug @abc", null, u);
    await handleAnimeAction(second.msg, p23Client);
    if (second.replies[0]?.includes("cooldown")) {
      pass("L5 scenario D: alias cycling blocked by shared cooldown key");
    } else {
      fail("L5 scenario D alias cycling", second.replies);
    }
  }

  // L6: Scenario E — other users are unaffected by one user's limit.
  {
    const other = mkAshMessage("ash frobnicate", null, "user-rate-e");
    await handleAnimeAction(other.msg, p23Client);
    if (other.replies[0]?.includes("Unknown action")) {
      pass("L6 scenario E: limits are per-user (other users unaffected)");
    } else {
      fail("L6 scenario E per-user isolation", other.replies);
    }
  }
}

/* ================================================================
 * Y — LOCAL MEDIA PROVIDER (local-first chain)
 * ================================================================ */

async function localMediaTests(): Promise<void> {
  console.log("\n--- Local Media Provider (local-first) ---");

  const rootY = makeTmpRoot("ashenai-gifs-y-");
  const hugDir = path.join(rootY, "actions", "hug");
  fs.mkdirSync(hugDir, { recursive: true });
  fs.writeFileSync(path.join(hugDir, "ok.gif"), gifBytes(1, 1));

  resetLocalGifsForTests();
  const index = await initializeLocalGifs({ root: rootY });

  // Y1 — all 32 action media keys + every AFK category are valid
  // local keys; traversal/unknown/naked keys are rejected.
  {
    const all = getAllActions();
    const badKeys = all.filter((a) => !isValidLocalGifKey(`actions:${a.mediaKey}`)).map((a) => a.name);
    const badAfk = AFK_CATEGORIES.filter((c) => !isValidLocalGifKey(`afk:${c}`));
    const negatives = [
      "actions:unknown",
      "actions:../hug",
      "actions:",
      "afk:nope",
      "afk:eating/../x",
      "media:hug",
      "hug",
      "",
    ];
    const leaked = negatives.filter((k) => isValidLocalGifKey(k));
    if (all.length === 32 && badKeys.length === 0 && badAfk.length === 0 && leaked.length === 0) {
      pass(`Y1 32/32 mediaKeys + ${AFK_CATEGORIES.length} AFK categories valid; hostile keys rejected`);
    } else {
      fail("Y1 key mapping", { count: all.length, badKeys, badAfk, leaked });
    }
  }

  // Y2 — the injected root yields exactly one validated asset.
  {
    const list = index.byKey.get("actions:hug");
    if (index.totalAssets === 1 && list?.length === 1 && list[0].relPath === "actions/hug/ok.gif") {
      pass("Y2 local index exposes the single validated asset");
    } else {
      fail("Y2 local index", { total: index.totalAssets, keys: [...index.byKey.keys()] });
    }
  }

  // Y3 — local hit wins: zero provider HTTP calls, nothing in the
  // remote URL cache (local results are never cached remotely).
  clearAnimationCache();
  {
    let calls = 0;
    const client: AnimeHttpClient = async () => {
      calls++;
      return { ok: false, status: 0, body: "", failure: "network" };
    };
    const r = await fetchAnimation("hug", { httpClient: client });
    const stats = getAnimationCacheStats();
    if (r && r.source === "local" && r.localAsset && !r.url && calls === 0 && stats.size === 0) {
      pass("Y3 local hit: source=local, zero provider calls, remote cache untouched");
    } else {
      fail("Y3 local first", { r, calls, cacheSize: stats.size });
    }
  }

  // Y4 — local miss falls through to the remote chain (both providers).
  clearAnimationCache();
  {
    let calls = 0;
    const client: AnimeHttpClient = async () => {
      calls++;
      return { ok: true, status: 200, body: JSON.stringify({ url: "https://media.example.com/remote.gif" }) };
    };
    const r = await fetchAnimation("punch", { httpClient: client });
    if (r && r.url === "https://media.example.com/remote.gif" && !r.localAsset && r.source !== "local" && calls === 2) {
      pass("Y4 local miss → remote chain (both providers called, URL returned)");
    } else {
      fail("Y4 remote fallback", { r, calls });
    }
  }

  // Y5 — the localGifs:null seam disables local lookup even though a
  // local asset exists for this key (remote-chain test opt-out).
  clearAnimationCache();
  {
    let calls = 0;
    const client: AnimeHttpClient = async () => {
      calls++;
      return { ok: true, status: 200, body: JSON.stringify({ url: "https://media.example.com/remote.gif" }) };
    };
    const r = await fetchAnimation("hug", { httpClient: client, localGifs: null });
    if (r && !r.localAsset && r.url === "https://media.example.com/remote.gif" && calls === 2) {
      pass("Y5 localGifs:null seam disables local lookup (remote chain used)");
    } else {
      fail("Y5 localGifs:null seam", { r, calls });
    }
  }

  // Y6 — injected resolver seam: deterministic asset, zero HTTP.
  {
    let calls = 0;
    const client: AnimeHttpClient = async () => {
      calls++;
      return { ok: false, status: 0, body: "", failure: "network" };
    };
    const fake: LocalGifAsset = {
      key: "actions:hug",
      root: rootY,
      relPath: "actions/hug/ok.gif",
      sizeBytes: 32,
      license: "unspecified",
    };
    const r = await fetchAnimation("hug", { httpClient: client, localGifs: { resolve: async () => fake } });
    if (r && r.localAsset === fake && r.source === "local" && calls === 0) {
      pass("Y6 injected localGifs resolver seam honoured (zero HTTP)");
    } else {
      fail("Y6 injected resolver", { r, calls });
    }
  }

  // Y7 — engine local branch: relPath + asset captured, no URL.
  clearAnimationCache();
  const y7msg = {
    author: { id: "user-y7", username: "tester" },
    member: { displayName: "Tester" },
    guild: { id: "guild-y7", members: { fetch: async (id: string) => ({ id, displayName: "TargetUser" }) } },
  } as unknown as Message;
  const y7 = await executeAction("hug", y7msg, "777777777777777777", "bot-y7", { httpClient: failClient });
  if (
    y7 &&
    y7.localMediaPath === "actions/hug/ok.gif" &&
    y7.localMediaAsset &&
    !y7.animationUrl &&
    y7.animationSource === "local" &&
    y7.text.trim().length > 0
  ) {
    pass("Y7 engine returns localMediaPath/asset with no animationUrl");
  } else {
    fail("Y7 engine local branch", y7);
  }

  // Y8 — response builder attaches validated bytes; the path/root
  // never appears in user-facing content.
  if (y7) {
    const reply = await buildDiscordResponse(y7);
    const file = reply.files?.[0];
    if (
      reply.content &&
      reply.content === y7.text &&
      file &&
      file.name === "anime.gif" &&
      !reply.content.includes("actions/hug") &&
      !reply.content.includes(rootY)
    ) {
      pass("Y8 local GIF attached as anime.gif; content leaks no path");
    } else {
      fail("Y8 local attachment", { content: reply.content, name: file?.name });
    }
  } else {
    fail("Y8 local attachment", "Y7 produced no result");
  }

  // Y9 — local read failure degrades to text-only (no path, no throw).
  {
    const reply = await buildDiscordResponse({
      text: "fallback text",
      animationSource: "local",
      localMediaPath: "actions/hug/gone.gif",
      localMediaAsset: {
        key: "actions:hug",
        root: rootY,
        relPath: "actions/hug/gone.gif",
        sizeBytes: 1,
        license: "unspecified",
      },
    });
    if (reply.content === "fallback text" && !reply.files) {
      pass("Y9 local read failure → text-only fallback, path never surfaced");
    } else {
      fail("Y9 local read failure", reply);
    }
  }

  // Y10 — end to end through the prefix handler: the local GIF is
  // served as an attachment with no remote fetch involved.
  const y10Guild = "guild-y10-local";
  try {
    const cfg = { ...loadGuildConfig(y10Guild) } as any;
    cfg.social = {
      ...cfg.social,
      enabled: true,
      animeActions: true,
      channels: {},
      customReactions: false,
      customEmoji: false,
      rivalryMode: false,
      debateMode: false,
      globalCooldownMs: 0,
      maxResponsesPerHour: 1000,
    };
    saveGuildConfig(cfg);
    invalidateGuildConfigCache();

    const t = mkAshMessage("ash hug <@777777777777777777>", y10Guild, "user-y10", { guildMode: "plain" });
    await handleAnimeAction(t.msg, p23Client);
    const payload = t.raw[0];
    if (
      payload &&
      typeof payload === "object" &&
      typeof payload.content === "string" &&
      payload.content.length > 0 &&
      Array.isArray(payload.files) &&
      payload.files.length === 1 &&
      payload.files[0]?.name === "anime.gif" &&
      !payload.content.includes(rootY)
    ) {
      pass("Y10 prefix handler end-to-end: local GIF attached, no remote fetch");
    } else {
      fail("Y10 end-to-end local attach", t.raw);
    }
  } catch (e) {
    fail("Y10 end-to-end local attach", e);
  } finally {
    deleteGuildConfig(y10Guild);
    invalidateGuildConfigCache();
  }

  // Restore the shared provider to an empty index and drop fixtures.
  resetLocalGifsForTests();
  await initializeLocalGifs({ root: makeTmpRoot("ashenai-gifs-empty-") });
}

primeLocalMedia()
  .then(() => p23FlagTests())
  .then(() => phase3Tests())
  .then(() => finalMatrixTests())
  .then(() => targetMatrixTests())
  .then(() => cooldownSemanticsTests())
  .then(() => flagStateTests())
  .then(() => botPolicyTests())
  .then(() => providerCacheTests())
  .then(() => engineBoundaryTests())
  .then(() => mentionSafetyTests())
  .then(() => moderationSpyTests())
  .then(() => concurrencyRestartTests())
  .then(() => rateLimitTests())
  .then(() => localMediaTests())
  .catch((e) => fail("Flag/phase-3 tests crashed", e))
  .finally(() => {
    // ─────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────

    for (const root of tmpRoots) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* fixture cleanup is best-effort */
      }
    }

    console.log(`\n--- Results ---`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total: ${passed + failed}`);

    if (failed > 0) {
      process.exit(1);
    }
  });
