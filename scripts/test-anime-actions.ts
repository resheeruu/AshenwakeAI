/* ================================================================
 * ANIME ACTION SYSTEM TEST SUITE
 *
 * Tests action definitions, engine, prefix parsing, animation
 * providers, safety, and integration.
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
  if (actions.length >= 14) {
    pass(`All actions loaded (${actions.length})`);
  } else {
    fail("All actions loaded", actions.length);
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
  if (affection.length >= 5 && combat.length >= 5 && fun.length >= 4) {
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

// ─────────────────────────────────────
// PREFIX PARSING
// ─────────────────────────────────────

console.log("\n--- Prefix Parsing ---");

// 10. "ash hug @user" detected
try {
  if (isAnimeActionPrefix("ash hug @user")) {
    pass("'ash hug @user' detected");
  } else {
    fail("'ash hug @user' detected");
  }
} catch (e) {
  fail("'ash hug @user' detected", e);
}

// 11. "ash" alone detected
try {
  if (isAnimeActionPrefix("ash")) {
    pass("'ash' alone detected");
  } else {
    fail("'ash' alone detected");
  }
} catch (e) {
  fail("'ash' alone detected", e);
}

// 12. "ash actions" detected
try {
  if (isAnimeActionPrefix("ash actions")) {
    pass("'ash actions' detected");
  } else {
    fail("'ash actions' detected");
  }
} catch (e) {
  fail("'ash actions' detected", e);
}

// 13. Non-ash prefix not detected
try {
  if (!isAnimeActionPrefix("!hug @user")) {
    pass("Non-ash prefix not detected");
  } else {
    fail("Non-ash prefix not detected");
  }
} catch (e) {
  fail("Non-ash prefix not detected", e);
}

// 14. "@AshenAI hug @user" not detected (this is mention, not prefix)
try {
  if (!isAnimeActionPrefix("@AshenAI hug @user")) {
    pass("Mention format not detected as prefix");
  } else {
    fail("Mention format not detected as prefix");
  }
} catch (e) {
  fail("Mention format not detected as prefix", e);
}

// 15. Case insensitive
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

// 16. Social "kick" is NOT a moderation kick
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

// 17. Social actions don't require moderation permissions
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

// 18. All actions have cooldowns
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

// 19. All actions have responses
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

// 20. Bot target actions have bot responses
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

// ─────────────────────────────────────
// CACHE
// ─────────────────────────────────────

console.log("\n--- Cache ---");

// 21. Cache stats work
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

// ─────────────────────────────────────
// INTEGRATION
// ─────────────────────────────────────

console.log("\n--- Integration ---");

// 22. All actions have emoji
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

// 23. All actions have valid category
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

// 24. Aliases don't collide
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
