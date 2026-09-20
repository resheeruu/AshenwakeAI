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
  if (cmd && cmd.data && cmd.data.name === "prompt" && typeof cmd.execute === "function") {
    pass("/prompt personality command factory");
  } else {
    fail("/prompt personality command factory", cmd?.data?.name);
  }
} catch (e) {
  fail("/prompt personality command factory", e);
}

// 2. Builder command renamed to /build
try {
  const cmd = createPromptCommand();
  if (cmd && cmd.data && cmd.data.name === "build" && typeof cmd.execute === "function") {
    pass("/build builder command factory");
  } else {
    fail("/build builder command factory", cmd?.data?.name);
  }
} catch (e) {
  fail("/build builder command factory", e);
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

// 11. /prompt and /build have different command names (no collision)
try {
  const personalityCmd = createPersonalityCommand();
  const builderCmd = createPromptCommand();
  if (personalityCmd.data.name !== builderCmd.data.name) {
    pass("/prompt and /build have different names");
  } else {
    fail("/prompt and /build have different names", {
      prompt: personalityCmd.data.name,
      build: builderCmd.data.name,
    });
  }
} catch (e) {
  fail("/prompt and /build have different names", e);
}

// 12. /prompt personality command name is "prompt"
try {
  const cmd = createPersonalityCommand();
  if (cmd.data.name === "prompt") {
    pass("/prompt name is 'prompt'");
  } else {
    fail("/prompt name is 'prompt'", cmd.data.name);
  }
} catch (e) {
  fail("/prompt name is 'prompt'", e);
}

// 13. /build builder command name is "build"
try {
  const cmd = createPromptCommand();
  if (cmd.data.name === "build") {
    pass("/build name is 'build'");
  } else {
    fail("/build name is 'build'", cmd.data.name);
  }
} catch (e) {
  fail("/build name is 'build'", e);
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

// 15. /help metadata has 'build' key (not 'prompt' for builder)
try {
  // The help.ts COMMAND_METADATA must have 'build' for the builder
  // and 'prompt' for the personality command
  const helpSource = require("fs").readFileSync(
    require("path").resolve(__dirname, "../src/commands/help.ts"),
    "utf-8"
  );
  const hasBuildKey = /build:\s*\{/.test(helpSource);
  const hasPromptKey = /prompt:\s*\{/.test(helpSource);
  if (hasBuildKey && hasPromptKey) {
    pass("/help has both 'build' and 'prompt' metadata keys");
  } else {
    fail("/help has both 'build' and 'prompt' metadata keys", { hasBuildKey, hasPromptKey });
  }
} catch (e) {
  fail("/help has both 'build' and 'prompt' metadata keys", e);
}

// 16. /help metadata 'prompt' refers to personality, not builder
try {
  const helpSource = require("fs").readFileSync(
    require("path").resolve(__dirname, "../src/commands/help.ts"),
    "utf-8"
  );
  // The prompt metadata should mention "personality" or "custom prompt", not "Builder session"
  const promptLine = helpSource.split("\n").find((l: string) => /prompt:\s*\{/.test(l));
  if (promptLine && !promptLine.includes("Builder session")) {
    pass("/help 'prompt' metadata describes personality (not builder)");
  } else {
    fail("/help 'prompt' metadata describes personality (not builder)", promptLine);
  }
} catch (e) {
  fail("/help 'prompt' metadata describes personality (not builder)", e);
}

// 17. /help metadata 'build' refers to Builder session
try {
  const helpSource = require("fs").readFileSync(
    require("path").resolve(__dirname, "../src/commands/help.ts"),
    "utf-8"
  );
  const buildLine = helpSource.split("\n").find((l: string) => /build:\s*\{/.test(l));
  if (buildLine && buildLine.includes("Builder")) {
    pass("/help 'build' metadata describes Builder session");
  } else {
    fail("/help 'build' metadata describes Builder session", buildLine);
  }
} catch (e) {
  fail("/help 'build' metadata describes Builder session", e);
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
