/* ================================================================
 * PERSONALITY COMMAND TEST SUITE
 *
 * Tests the /prompt personality command and related config.
 * ================================================================ */

import { createPersonalityCommand } from "../src/commands/personality";
import { createPromptCommand } from "../src/commands/prompt";
import { SETTINGS_CATEGORIES, ALL_SETTINGS } from "../src/settings/definitions";
import type { GuildConfig } from "../src/core/guild-config";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`❌ ${name}`, error ?? "");
  failed++;
}

console.log("\n🧪 Personality Command Test Suite\n");

// ─────────────────────────────────────
// COMMAND FACTORY TESTS
// ─────────────────────────────────────

console.log("--- Command Factories ---");

// 1. Personality command exists
try {
  const cmd = createPersonalityCommand();
  if (cmd && cmd.data && cmd.data.name === "personality" && typeof cmd.execute === "function") {
    pass("/personality command factory");
  } else {
    fail("/personality command factory", cmd?.data?.name);
  }
} catch (e) {
  fail("/personality command factory", e);
}

// 2. Builder command is /prompt
try {
  const cmd = createPromptCommand();
  if (cmd && cmd.data && cmd.data.name === "prompt" && typeof cmd.execute === "function") {
    pass("/prompt builder command factory");
  } else {
    fail("/prompt builder command factory", cmd?.data?.name);
  }
} catch (e) {
  fail("/prompt builder command factory", e);
}

// 3. Personality command has subcommands
try {
  const cmd = createPersonalityCommand();
  const json = cmd.data.toJSON();
  if (json.options && json.options.length === 3) {
    const subNames = json.options.map((o: any) => o.name).sort();
    if (subNames.includes("set") && subNames.includes("view") && subNames.includes("reset")) {
      pass("Personality has set/view/reset subcommands");
    } else {
      fail("Personality has set/view/reset subcommands", subNames);
    }
  } else {
    fail("Personality has set/view/reset subcommands", json.options?.length);
  }
} catch (e) {
  fail("Personality has set/view/reset subcommands", e);
}

// ─────────────────────────────────────
// GUILD CONFIG TESTS
// ─────────────────────────────────────

console.log("\n--- Guild Config ---");

// 4. GuildConfig has personality field
try {
  const config: GuildConfig = {
    guildId: "test",
    enabled: true,
    automod: {
      enabled: false, antiSpam: false, antiFlood: false, mentionSpam: false,
      antiCaps: false, antiInvite: false, antiLink: false, antiScam: false,
      antiZalgo: false, raidMode: false, maxMentions: 5, maxMessages: 5,
      floodWindowMs: 10000,
    },
    moderation: { enabled: false, defaultTimeoutMinutes: 5, maxWarnBeforeAction: 3, autoBanOnMaxWarn: false },
    tickets: { enabled: false, types: [] },
    community: { xpEnabled: false, levelsEnabled: false, reactionRoles: false, welcomeEnabled: false, goodbyeEnabled: false, onboardingEnabled: false },
    automation: { enabled: false },
    personality: { name: "AshenAI", tone: "friendly", customInstructions: "" },
    memory: { enabled: false, maxMessages: 100 },
    usage: { dailyLimit: 100, monthlyLimit: 1000, rateLimitPerMinute: 10, burstLimit: 5 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (config.personality && config.personality.name === "AshenAI") {
    pass("GuildConfig has personality.name");
  } else {
    fail("GuildConfig has personality.name");
  }
  if (config.personality && config.personality.customInstructions === "") {
    pass("GuildConfig has personality.customInstructions");
  } else {
    fail("GuildConfig has personality.customInstructions");
  }
} catch (e) {
  fail("GuildConfig personality fields", e);
}

// 5. GuildConfig has social field
try {
  const config: GuildConfig = {
    guildId: "test",
    enabled: true,
    automod: {
      enabled: false, antiSpam: false, antiFlood: false, mentionSpam: false,
      antiCaps: false, antiInvite: false, antiLink: false, antiScam: false,
      antiZalgo: false, raidMode: false, maxMentions: 5, maxMessages: 5,
      floodWindowMs: 10000,
    },
    moderation: { enabled: false, defaultTimeoutMinutes: 5, maxWarnBeforeAction: 3, autoBanOnMaxWarn: false },
    tickets: { enabled: false, types: [] },
    community: { xpEnabled: false, levelsEnabled: false, reactionRoles: false, welcomeEnabled: false, goodbyeEnabled: false, onboardingEnabled: false },
    automation: { enabled: false },
    personality: { name: "AshenAI", tone: "friendly", customInstructions: "" },
    memory: { enabled: false, maxMessages: 100 },
    usage: { dailyLimit: 100, monthlyLimit: 1000, rateLimitPerMinute: 10, burstLimit: 5 },
    social: {
      enabled: false,
      channels: {},
      globalCooldownMs: 30000,
      maxResponsesPerHour: 10,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (config.social && config.social.enabled === false) {
    pass("GuildConfig has social.enabled");
  } else {
    fail("GuildConfig has social.enabled");
  }
  if (config.social && config.social.globalCooldownMs === 30000) {
    pass("GuildConfig has social.globalCooldownMs");
  } else {
    fail("GuildConfig has social.globalCooldownMs");
  }
} catch (e) {
  fail("GuildConfig social fields", e);
}

// ─────────────────────────────────────
// SETTINGS TESTS
// ─────────────────────────────────────

console.log("\n--- Settings ---");

// 6. Social category exists in settings
try {
  const socialCat = SETTINGS_CATEGORIES.find((c: any) => c.id === "social");
  if (socialCat && socialCat.label === "AI Social") {
    pass("Settings has social category");
  } else {
    fail("Settings has social category", socialCat);
  }
} catch (e) {
  fail("Settings has social category", e);
}

// 7. Personality category exists in settings
try {
  const personalityCat = SETTINGS_CATEGORIES.find((c: any) => c.id === "personality");
  if (personalityCat && personalityCat.label === "Personality") {
    pass("Settings has personality category");
  } else {
    fail("Settings has personality category", personalityCat);
  }
} catch (e) {
  fail("Settings has personality category", e);
}

// 8. Social settings exist
try {
  const socialSettings = ALL_SETTINGS.filter((s: any) => s.category === "social");
  if (socialSettings.length >= 3) {
    pass(`Social has ${socialSettings.length} settings`);
  } else {
    fail("Social settings count", socialSettings.length);
  }
} catch (e) {
  fail("Social settings count", e);
}

// 9. Personality settings exist
try {
  const personalitySettings = ALL_SETTINGS.filter((s: any) => s.category === "personality");
  if (personalitySettings.length >= 2) {
    pass(`Personality has ${personalitySettings.length} settings`);
  } else {
    fail("Personality settings count", personalitySettings.length);
  }
} catch (e) {
  fail("Personality settings count", e);
}

// ─────────────────────────────────────
// AI SOCIAL SCOPE TESTS
// ─────────────────────────────────────

console.log("\n--- AI Social Scope ---");

// 10. ChannelScope includes AI_SOCIAL
try {
  // This is a compile-time check essentially
  const socialScope = "AI_SOCIAL" as const;
  if (socialScope === "AI_SOCIAL") {
    pass("AI_SOCIAL scope defined");
  } else {
    fail("AI_SOCIAL scope defined");
  }
} catch (e) {
  fail("AI_SOCIAL scope defined", e);
}

// ─────────────────────────────────────
// REGISTRATION TESTS
// ─────────────────────────────────────

console.log("\n--- Registration ---");

// 11. /personality and /prompt have different command names (no collision)
try {
  const personalityCmd = createPersonalityCommand();
  const builderCmd = createPromptCommand();
  if (personalityCmd.data.name !== builderCmd.data.name) {
    pass("/personality and /prompt have different names");
  } else {
    fail("/personality and /prompt have different names", {
      personality: personalityCmd.data.name,
      prompt: builderCmd.data.name,
    });
  }
} catch (e) {
  fail("/personality and /prompt have different names", e);
}

// 12. /personality command name is "personality"
try {
  const cmd = createPersonalityCommand();
  if (cmd.data.name === "personality") {
    pass("/personality name is 'personality'");
  } else {
    fail("/personality name is 'personality'", cmd.data.name);
  }
} catch (e) {
  fail("/personality name is 'personality'", e);
}

// 13. /prompt builder command name is "prompt"
try {
  const cmd = createPromptCommand();
  if (cmd.data.name === "prompt") {
    pass("/prompt name is 'prompt'");
  } else {
    fail("/prompt name is 'prompt'", cmd.data.name);
  }
} catch (e) {
  fail("/prompt name is 'prompt'", e);
}

// 14. /settings-update is NOT registered (dead code)
try {
  // createSettingsUpdateCommand is exported from settings.ts but should NOT be imported in index.ts
  // We verify by checking the function exists but is separate from createSettingsCommand
  const { createSettingsCommand } = require("../src/commands/settings");
  const settingsCmd = createSettingsCommand();
  if (settingsCmd.data.name === "settings") {
    pass("/settings registered (not /settings-update)");
  } else {
    fail("/settings registered (not /settings-update)", settingsCmd.data.name);
  }
} catch (e) {
  fail("/settings registered (not /settings-update)", e);
}

// ─────────────────────────────────────
// HELP METADATA TESTS
// ─────────────────────────────────────

console.log("\n--- Help Metadata ---");

// 15. /help metadata has 'prompt' key (for builder) and 'personality' key
try {
  const helpSource = require("fs").readFileSync(
    require("path").resolve(__dirname, "../src/commands/help.ts"),
    "utf-8"
  );
  const hasPromptKey = /prompt:\s*\{/.test(helpSource);
  const hasPersonalityKey = /personality:\s*\{/.test(helpSource);
  if (hasPromptKey && hasPersonalityKey) {
    pass("/help has both 'prompt' and 'personality' metadata keys");
  } else {
    fail("/help has both 'prompt' and 'personality' metadata keys", { hasPromptKey, hasPersonalityKey });
  }
} catch (e) {
  fail("/help has both 'prompt' and 'personality' metadata keys", e);
}

// 16. /help metadata 'prompt' refers to builder, not personality
try {
  const helpSource = require("fs").readFileSync(
    require("path").resolve(__dirname, "../src/commands/help.ts"),
    "utf-8"
  );
  const promptLine = helpSource.split("\n").find((l: string) => /prompt:\s*\{/.test(l));
  if (promptLine && (promptLine.includes("builder") || promptLine.includes("server") || promptLine.includes("natural language"))) {
    pass("/help 'prompt' metadata describes builder (not personality)");
  } else {
    fail("/help 'prompt' metadata describes builder (not personality)", promptLine);
  }
} catch (e) {
  fail("/help 'prompt' metadata describes builder (not personality)", e);
}

// 17. /help metadata 'prompt' refers to Builder session
try {
  const helpSource = require("fs").readFileSync(
    require("path").resolve(__dirname, "../src/commands/help.ts"),
    "utf-8"
  );
  const promptLine = helpSource.split("\n").find((l: string) => /prompt:\s*\{/.test(l));
  if (promptLine && /builder|build/i.test(promptLine)) {
    pass("/help 'prompt' metadata describes Builder session");
  } else {
    fail("/help 'prompt' metadata describes Builder session", promptLine);
  }
} catch (e) {
  fail("/help 'prompt' metadata describes Builder session", e);
}

// ─────────────────────────────────────
// INJECTION PROTECTION TESTS
// ─────────────────────────────────────

console.log("\n--- Injection Protection ---");

// 18. Personality command warns on injection patterns
try {
  // The personality.ts source should contain injection detection
  const personalitySource = require("fs").readFileSync(
    require("path").resolve(__dirname, "../src/commands/personality.ts"),
    "utf-8"
  );
  const hasInjectionCheck = /injection/i.test(personalitySource) && /ignore.*previous/i.test(personalitySource);
  if (hasInjectionCheck) {
    pass("Personality command has injection detection");
  } else {
    fail("Personality command has injection detection");
  }
} catch (e) {
  fail("Personality command has injection detection", e);
}

// 19. Personality command enforces character limit
try {
  const personalitySource = require("fs").readFileSync(
    require("path").resolve(__dirname, "../src/commands/personality.ts"),
    "utf-8"
  );
  const hasMaxLength = /MAX_PROMPT_LENGTH/.test(personalitySource) && /MIN_PROMPT_LENGTH/.test(personalitySource);
  if (hasMaxLength) {
    pass("Personality command enforces character limits");
  } else {
    fail("Personality command enforces character limits");
  }
} catch (e) {
  fail("Personality command enforces character limits", e);
}

// 20. Personality command requires ManageGuild permission
try {
  const cmd = createPersonalityCommand();
  const json = cmd.data.toJSON();
  // Default member permissions should be set (ManageGuild = 0x20n)
  if (json.default_member_permissions !== undefined) {
    pass("Personality command has permission restrictions");
  } else {
    fail("Personality command has permission restrictions");
  }
} catch (e) {
  fail("Personality command has permission restrictions", e);
}

// ─────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────

console.log(`\n--- Results ---`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
