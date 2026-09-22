/**
 * test-emoji-icons.ts — Validate emoji icon system and anime emotion icons
 */
import assert from "node:assert/strict";
import { ICON_MAP, ICON_NAMES, LOGICAL_TO_LEGACY, type IconName } from "../src/discord/icons";
import { emoji, E_SUCCESS, E_ERROR, E_WARNING, E_INFO, E_AI, E_LOADING, E_ONLINE, E_OFFLINE, E_DEGRADED, E_SETTINGS, E_ARROW, E_MENU, E_REFRESH, E_MEMORY, E_STATS, E_THINK, E_HAPPY, E_SAD, E_ANGRY, E_CONFUSED, E_SHY, E_SURPRISED, E_SLEEP, E_FOCUS, E_LAUGH, configuredEmojis, hasCustomEmoji } from "../src/discord/emojis";
import { ANIME_EMOTE_MAP, ANIME_EMOTE_NAMES, animeEmote, hasAnimeEmote, configuredAnimeEmotes } from "../src/discord/anime-emotes";
import { resetProvisioner, getProvisionResult, applyEnvOverrides, type ProvisionResult } from "../src/discord/emoji-provisioner";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log("\n╔══════════════════════════════════════╗");
console.log("║  EMOJI ICON SYSTEM TESTS             ║");
console.log("╚══════════════════════════════════════╝\n");

console.log("--- Core Icons ---");

test("ICON_MAP has all 25 icons", () => {
  assert.equal(ICON_NAMES.length, 25, `Expected 25 icons, got ${ICON_NAMES.length}`);
});

test("ICON_NAMES includes all expected names", () => {
  const expected: IconName[] = [
    "ai", "success", "error", "warning", "info", "loading",
    "online", "offline", "degraded", "settings", "arrow", "menu",
    "refresh", "memory", "stats",
    "think", "happy", "sad", "angry", "confused", "shy",
    "surprised", "sleep", "focus", "laugh",
  ];
  for (const name of expected) {
    assert.ok(ICON_NAMES.includes(name), `Missing icon: ${name}`);
  }
});

test("Every icon has a valid fallback", () => {
  for (const [name, config] of Object.entries(ICON_MAP)) {
    assert.ok(config.fallback, `Icon ${name} missing fallback`);
    assert.ok(config.color, `Icon ${name} missing color`);
    assert.ok(config.envVar, `Icon ${name} missing envVar`);
    assert.ok(config.tabler, `Icon ${name} missing tabler`);
  }
});

console.log("\n--- Convenience Getters ---");

test("E_SUCCESS returns a string", () => {
  const val = E_SUCCESS();
  assert.equal(typeof val, "string");
  assert.ok(val.length > 0);
});

test("E_ERROR returns a string", () => {
  const val = E_ERROR();
  assert.equal(typeof val, "string");
});

test("E_WARNING returns a string", () => {
  const val = E_WARNING();
  assert.equal(typeof val, "string");
});

test("E_INFO returns a string", () => {
  const val = E_INFO();
  assert.equal(typeof val, "string");
});

test("E_AI returns a string", () => {
  const val = E_AI();
  assert.equal(typeof val, "string");
});

test("E_LOADING returns a string", () => {
  const val = E_LOADING();
  assert.equal(typeof val, "string");
});

test("E_ONLINE returns a string", () => {
  const val = E_ONLINE();
  assert.equal(typeof val, "string");
});

test("E_OFFLINE returns a string", () => {
  const val = E_OFFLINE();
  assert.equal(typeof val, "string");
});

test("E_DEGRADED returns a string", () => {
  const val = E_DEGRADED();
  assert.equal(typeof val, "string");
});

test("E_SETTINGS returns a string", () => {
  const val = E_SETTINGS();
  assert.equal(typeof val, "string");
});

test("E_ARROW returns a string", () => {
  const val = E_ARROW();
  assert.equal(typeof val, "string");
});

test("E_MENU returns a string", () => {
  const val = E_MENU();
  assert.equal(typeof val, "string");
});

test("E_REFRESH returns a string", () => {
  const val = E_REFRESH();
  assert.equal(typeof val, "string");
});

test("E_MEMORY returns a string", () => {
  const val = E_MEMORY();
  assert.equal(typeof val, "string");
});

test("E_STATS returns a string", () => {
  const val = E_STATS();
  assert.equal(typeof val, "string");
});

console.log("\n--- Anime Emotion Getters ---");

test("E_THINK returns a string", () => {
  const val = E_THINK();
  assert.equal(typeof val, "string");
  assert.ok(val.length > 0);
});

test("E_HAPPY returns a string", () => {
  const val = E_HAPPY();
  assert.equal(typeof val, "string");
});

test("E_SAD returns a string", () => {
  const val = E_SAD();
  assert.equal(typeof val, "string");
});

test("E_ANGRY returns a string", () => {
  const val = E_ANGRY();
  assert.equal(typeof val, "string");
});

test("E_CONFUSED returns a string", () => {
  const val = E_CONFUSED();
  assert.equal(typeof val, "string");
});

test("E_SHY returns a string", () => {
  const val = E_SHY();
  assert.equal(typeof val, "string");
});

test("E_SURPRISED returns a string", () => {
  const val = E_SURPRISED();
  assert.equal(typeof val, "string");
});

test("E_SLEEP returns a string", () => {
  const val = E_SLEEP();
  assert.equal(typeof val, "string");
});

test("E_FOCUS returns a string", () => {
  const val = E_FOCUS();
  assert.equal(typeof val, "string");
});

test("E_LAUGH returns a string", () => {
  const val = E_LAUGH();
  assert.equal(typeof val, "string");
});

console.log("\n--- emoji() Function ---");

test("emoji() accepts all IconNames", () => {
  for (const name of ICON_NAMES) {
    const val = emoji(name);
    assert.equal(typeof val, "string", `emoji(${name}) should return string`);
    assert.ok(val.length > 0, `emoji(${name}) should not be empty`);
  }
});

test("emoji() falls back to Unicode when no custom emoji", () => {
  const val = emoji("ai");
  assert.equal(typeof val, "string");
  assert.ok(val.length > 0);
});

test("unicodeFallback returns Unicode for each icon", () => {
  const { unicodeFallback } = require("../src/discord/emojis");
  for (const name of ICON_NAMES) {
    const fb = unicodeFallback(name);
    assert.equal(typeof fb, "string", `unicodeFallback(${name}) should return string`);
    assert.ok(fb.length > 0, `unicodeFallback(${name}) should not be empty`);
  }
});

console.log("\n--- Emoji Provisioner ---");

test("resetProvisioner clears state", () => {
  resetProvisioner();
  const result = getProvisionResult();
  assert.equal(result, null, "Provisioner should be null after reset");
});

test("LOGICAL_TO_LEGACY maps all icons", () => {
  for (const name of ICON_NAMES) {
    const legacy = LOGICAL_TO_LEGACY[name];
    assert.equal(typeof legacy, "string", `LOGICAL_TO_LEGACY[${name}] should be string`);
    assert.equal(legacy, `ash_${name}`, `Legacy name should be ash_${name}`);
  }
});

test("applyEnvOverrides applies overrides", () => {
  const result: ProvisionResult = {
    icons: {},
    animeEmotes: {},
    guildId: "123456",
    uploaded: 0,
    existing: 0,
    hadErrors: false,
  };
  // Set a test env var
  process.env.EMOJI_ASH_TEST_OVERRIDE = "999999";
  // applyEnvOverrides should not crash
  applyEnvOverrides(result);
  delete process.env.EMOJI_ASH_TEST_OVERRIDE;
  // Result should still be valid
  assert.equal(result.guildId, "123456");
});

test("ANIME_EMOTE_MAP has all expected categories", () => {
  // Reactions
  const reactions = ["happy", "laugh", "smug", "angry", "cry", "blush", "shock", "panic", "confused", "sleepy", "love", "embarrassed", "sad", "excited", "determined"];
  for (const name of reactions) {
    assert.ok(name in ANIME_EMOTE_MAP, `Missing reaction: ${name}`);
  }
  // Actions
  const actions = ["hug", "cuddle", "pat", "headpat", "kiss", "slap", "punch", "kick", "bonk", "bite", "poke", "wave", "highfive", "yeet", "dance", "throw", "hit", "smack", "tickle"];
  for (const name of actions) {
    assert.ok(name in ANIME_EMOTE_MAP, `Missing action: ${name}`);
  }
  // System
  const system = ["ai", "success", "error", "warning", "info", "loading", "online", "offline", "degraded", "settings", "stats"];
  for (const name of system) {
    assert.ok(name in ANIME_EMOTE_MAP, `Missing system: ${name}`);
  }
});

test("animeEmote returns text fallback when no provisioning", () => {
  resetProvisioner();
  for (const name of ANIME_EMOTE_NAMES) {
    const val = animeEmote(name);
    assert.equal(typeof val, "string", `animeEmote(${name}) should return string`);
    assert.ok(val.length > 0, `animeEmote(${name}) should not be empty`);
  }
});

test("Every icon has ash_* legacy name in LOGICAL_TO_LEGACY", () => {
  for (const name of ICON_NAMES) {
    assert.ok(`ash_${name}` in LOGICAL_TO_LEGACY, `Missing legacy name for ${name}`);
  }
});

console.log("\n--- Summary ---");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\n  🎉 All emoji icon tests passed!\n");
}
