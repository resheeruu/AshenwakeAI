"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ai_narrator_exports = {};
__export(ai_narrator_exports, {
  generateNarration: () => generateNarration,
  generateWorldEventNarration: () => generateWorldEventNarration
});
module.exports = __toCommonJS(ai_narrator_exports);
var import_system_usage = require("../ai/system-usage");
var import_load_manager = require("../core/load-manager");
const NARRATION_SYSTEM_PROMPT = `You are the Ashen Realms Dungeon Master. You narrate atmospheric descriptions for a dark fantasy RPG.

RULES:
- You ONLY generate narration, atmosphere, dialogue, and dramatic descriptions
- You NEVER determine damage, HP, XP, coins, loot, item stats, probabilities, rewards, progression, or world state
- The game engine handles ALL mechanics - you just make it feel alive
- Keep responses under 300 words
- Use dark fantasy tone with vivid imagery
- Reference the player's name, level, and region when appropriate
- Never break character or mention being an AI
- If you cannot generate narration, return an empty string`;
const FALLBACK_NARRATIONS = {
  victory: [
    "The shadows recede as your blade finds its mark. Victory is yours.",
    "The creature falls before you, its dark essence dissipating into the void.",
    "Your strength prevails. The realm trembles at your power."
  ],
  defeat: [
    "Darkness closes in as you fall. The realm claims another soul.",
    "Your strength fails you. The shadows consume all hope.",
    "The world fades to black. You awaken, battered but alive."
  ],
  loot: [
    "A glint of light catches your eye. Something valuable lies among the remains.",
    "Among the wreckage, you discover something precious.",
    "Fortune smiles upon you. A rare treasure reveals itself."
  ],
  levelUp: [
    "Power courses through your veins. You have grown stronger.",
    "The realm acknowledges your growth. New heights await.",
    "Your experience sharpens your skills. You ascend to greater power."
  ],
  exploration: [
    "The path ahead winds through ancient ruins and forgotten passages.",
    "Strange sounds echo from the darkness. Proceed with caution.",
    "The air grows thick with mystery. Something stirs in the shadows."
  ],
  default: [
    "The journey continues through the ever-shifting realms of Ashen.",
    "Your adventure unfolds in this dark and mysterious world.",
    "The realm watches as your story unfolds."
  ]
};
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function getFallbackNarration(request) {
  if (request.isDeath) {
    return pickRandom(FALLBACK_NARRATIONS.defeat);
  }
  if (request.isVictory) {
    return pickRandom(FALLBACK_NARRATIONS.victory);
  }
  if (request.isLoot) {
    return pickRandom(FALLBACK_NARRATIONS.loot);
  }
  if (request.isLevelUp) {
    return pickRandom(FALLBACK_NARRATIONS.levelUp);
  }
  if (request.isWorldEvent) {
    return request.worldEventDescription ?? pickRandom(FALLBACK_NARRATIONS.default);
  }
  return pickRandom(FALLBACK_NARRATIONS.default);
}
function buildNarrationPrompt(request) {
  const parts = [];
  parts.push(`Player: ${request.player.username} (Level ${request.player.level})`);
  if (request.regionName) {
    parts.push(`Region: ${request.regionName}`);
  }
  parts.push(`Action: ${request.action}`);
  parts.push(`Result: ${request.result}`);
  if (request.enemyName) {
    parts.push(`Enemy: ${request.enemyName}`);
  }
  if (request.context) {
    parts.push(`Context: ${request.context}`);
  }
  if (request.isVictory) {
    parts.push("Generate a brief victory narration.");
  } else if (request.isDeath) {
    parts.push("Generate a brief defeat narration.");
  } else if (request.isLoot && request.lootName) {
    parts.push(`Generate a brief loot discovery narration for: ${request.lootName}`);
  } else if (request.isLevelUp) {
    parts.push(`Generate a brief level up narration for level ${request.newLevel}.`);
  } else if (request.isWorldEvent) {
    parts.push("Generate a dramatic world event narration.");
  } else {
    parts.push("Generate a brief atmospheric narration.");
  }
  return parts.join("\n");
}
async function generateNarration(router, request, systemUsage) {
  const priority = (0, import_system_usage.getPriorityForSystem)("game-narrator");
  if (!(0, import_load_manager.canRunInternalOperation)(priority)) {
    return { text: getFallbackNarration(request), provider: "fallback", fallback: true };
  }
  const estimatedCredits = (0, import_system_usage.estimateSystemCredits)("narrate");
  if (systemUsage) {
    const check = systemUsage.canExecute("game-narrator", priority, estimatedCredits);
    if (!check.allowed) {
      return { text: getFallbackNarration(request), provider: "fallback", fallback: true };
    }
    systemUsage.acquire("game-narrator");
  }
  const prompt = buildNarrationPrompt(request);
  const messages = [
    { role: "system", content: NARRATION_SYSTEM_PROMPT },
    { role: "user", content: prompt }
  ];
  try {
    const response = await router.generate({
      messages,
      temperature: 0.8,
      maxTokens: 200
    });
    if (systemUsage) {
      systemUsage.record({
        system: "game-narrator",
        operation: "narration",
        provider: response.provider,
        credits: estimatedCredits,
        latencyMs: response.latencyMs,
        success: true
      });
    }
    if (response.text && response.text.trim().length > 0) {
      return {
        text: response.text.trim(),
        provider: response.provider,
        fallback: false
      };
    }
  } catch {
    if (systemUsage) {
      systemUsage.record({
        system: "game-narrator",
        operation: "narration",
        credits: estimatedCredits,
        success: false
      });
    }
  } finally {
    if (systemUsage) {
      systemUsage.release("game-narrator");
    }
  }
  return {
    text: getFallbackNarration(request),
    provider: "fallback",
    fallback: true
  };
}
async function generateWorldEventNarration(router, eventType, data, systemUsage) {
  const priority = (0, import_system_usage.getPriorityForSystem)("game-narrator");
  if (!(0, import_load_manager.canRunInternalOperation)(priority)) {
    return { text: "", provider: "fallback", fallback: true };
  }
  const estimatedCredits = (0, import_system_usage.estimateSystemCredits)("narrate");
  if (systemUsage) {
    const check = systemUsage.canExecute("game-narrator", priority, estimatedCredits);
    if (!check.allowed) {
      return { text: "", provider: "fallback", fallback: true };
    }
    systemUsage.acquire("game-narrator");
  }
  const prompts = {
    boss_spawn: `A world boss has appeared: ${data.bossName}. Generate a dramatic announcement (2-3 sentences).`,
    boss_defeat: `${data.playerName} has defeated the world boss ${data.bossName}! Generate a victory announcement.`,
    rare_loot: `${data.playerName} obtained a legendary item: ${data.itemName}. Generate a world announcement.`,
    level_milestone: `${data.playerName} reached level ${data.playerLevel}! Generate a realm acknowledgment.`,
    new_player: `${data.playerName} has entered the Ashen Realms. Generate a welcome narration.`
  };
  const messages = [
    { role: "system", content: NARRATION_SYSTEM_PROMPT },
    { role: "user", content: prompts[eventType] }
  ];
  try {
    const response = await router.generate({
      messages,
      temperature: 0.8,
      maxTokens: 150
    });
    if (systemUsage) {
      systemUsage.record({
        system: "game-narrator",
        operation: eventType,
        provider: response.provider,
        credits: estimatedCredits,
        latencyMs: response.latencyMs,
        success: true
      });
    }
    if (response.text && response.text.trim().length > 0) {
      return {
        text: response.text.trim(),
        provider: response.provider,
        fallback: false
      };
    }
  } catch {
    if (systemUsage) {
      systemUsage.record({
        system: "game-narrator",
        operation: eventType,
        credits: estimatedCredits,
        success: false
      });
    }
  } finally {
    if (systemUsage) {
      systemUsage.release("game-narrator");
    }
  }
  const fallbackTexts = {
    boss_spawn: `\u{1F6A8} **WORLD BOSS SPAWNED!** ${data.bossName} has appeared in the realm!`,
    boss_defeat: `\u{1F3C6} **WORLD EVENT!** ${data.bossName} has been slain by ${data.playerName}!`,
    rare_loot: `\u{1F3C6} **WORLD ANNOUNCEMENT!** ${data.playerName} obtained a legendary item!`,
    level_milestone: `\u26A1 **THE REALM HAS TAKEN NOTICE.** ${data.playerName} reached level ${data.playerLevel}!`,
    new_player: `\u{1F311} **A NEW SOUL HAS ENTERED ASHENWAKE.** Welcome, ${data.playerName}!`
  };
  return {
    text: fallbackTexts[eventType] ?? "Something stirs in the realm...",
    provider: "fallback",
    fallback: true
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateNarration,
  generateWorldEventNarration
});
