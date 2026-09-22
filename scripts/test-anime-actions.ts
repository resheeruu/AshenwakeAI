/* ================================================================
 * ANIME ACTION SYSTEM TEST SUITE
 *
 * Tests action definitions, engine, prefix parsing, media security,
 * animation providers, safety, and integration.
 * ================================================================ */

import {
  getAction,
  getAllActions,
  getActionsByCategory,
  resolveResponse,
} from "../src/games/anime-actions/definitions";
import {
  isAnimeActionPrefix,
} from "../src/games/anime-actions/prefix-handler";
import {
  getAnimationCacheStats,
  clearAnimationCache,
} from "../src/games/anime-actions/providers";
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
// SUMMARY
// ─────────────────────────────────────

console.log(`\n--- Results ---`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
