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
var prefix_handler_exports = {};
__export(prefix_handler_exports, {
  handleAnimeAction: () => handleAnimeAction,
  isAnimeActionPrefix: () => isAnimeActionPrefix
});
module.exports = __toCommonJS(prefix_handler_exports);
var import_rate_limit = require("../../security/rate-limit");
var import_logger = require("../../logger");
var import_definitions = require("./definitions");
var import_engine = require("./engine");
var import_anime_emotes = require("../../discord/anime-emotes");
const PREFIX = "ash ";
const actionRateLimiter = new import_rate_limit.UserRateLimiter(15, 6e4);
const actionCooldowns = /* @__PURE__ */ new Map();
function checkCooldown(userId, actionName, cooldownMs) {
  const key = `${userId}:${actionName}`;
  const lastUsed = actionCooldowns.get(key) ?? 0;
  const now = Date.now();
  const elapsed = now - lastUsed;
  if (elapsed < cooldownMs) {
    return { allowed: false, retryAfterMs: cooldownMs - elapsed };
  }
  actionCooldowns.set(key, now);
  return { allowed: true };
}
const COOLDOWN_CLEANUP_INTERVAL = 5 * 60 * 1e3;
const COOLDOWN_MAX_AGE = 60 * 60 * 1e3;
const cooldownCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of actionCooldowns) {
    if (now - timestamp > COOLDOWN_MAX_AGE) {
      actionCooldowns.delete(key);
    }
  }
}, COOLDOWN_CLEANUP_INTERVAL);
cooldownCleanupTimer.unref();
const CATEGORY_META = {
  affection: { emoji: "[affection]", label: "AFFECTION" },
  combat: { emoji: "[combat]", label: "COMBAT" },
  fun: { emoji: "[fun]", label: "FUN" }
};
function buildActionsHelp() {
  const lines = ["**ANIME ACTIONS**", ""];
  for (const category of ["affection", "combat", "fun"]) {
    const meta = CATEGORY_META[category];
    const actions = (0, import_definitions.getActionsByCategory)(category);
    const names = actions.map((a) => `\`${a.name}\``).join(" \u2022 ");
    lines.push(`**${meta.label}**`);
    lines.push(names);
    lines.push("");
  }
  lines.push("**Usage:**");
  lines.push("  `ash <action> @user` \u2014 target a mentioned user");
  lines.push("  `ash <action>` \u2014 self-target (for actions that support it)");
  lines.push("  Reply to a message with `ash <action>` to target that user");
  lines.push("");
  lines.push("**Examples:**");
  lines.push("  `ash hug @friend` \u2022 `ash punch @rival` \u2022 `ash dance`");
  lines.push("  `ash cry` \u2022 `ash blush` \u2022 `ash celebrate`");
  lines.push("");
  lines.push("**Aliases:** `h`=hug, `pu`=punch, `hp`=headpat, `sl`=slap, `hf`=highfive");
  return lines.join("\n");
}
async function resolveTarget(message, parts) {
  if (message.mentions.users.size > 0) {
    const mentioned = message.mentions.users.first();
    if (mentioned) return mentioned.id;
  }
  if (message.reference?.messageId) {
    const referenceId = message.reference.messageId;
    const cached = message.channel.messages.cache.get(referenceId);
    if (cached) {
      if (cached.author.id !== message.author.id) {
        return cached.author.id;
      }
    } else {
      try {
        const referenced = await message.fetchReference();
        if (referenced.author.id !== message.author.id) {
          return referenced.author.id;
        }
      } catch {
      }
    }
  }
  if (parts[1]) {
    const idMatch = parts[1].match(/^<?@?!?(\d{17,20})>?$/);
    if (idMatch) {
      return idMatch[1];
    }
    if (/^\d{17,20}$/.test(parts[1])) {
      return parts[1];
    }
  }
  return null;
}
function isAnimeActionPrefix(content) {
  const trimmed = content.trim().toLowerCase();
  return trimmed === "ash" || trimmed.startsWith("ash ");
}
async function handleAnimeAction(message, client) {
  const content = message.content.trim();
  if (!isAnimeActionPrefix(content)) return false;
  const afterPrefix = content.slice(3).trim();
  if (!afterPrefix) {
    await message.reply(buildActionsHelp()).catch(() => {
    });
    return true;
  }
  if (afterPrefix.toLowerCase() === "actions") {
    await message.reply(buildActionsHelp()).catch(() => {
    });
    return true;
  }
  const rateLimit = actionRateLimiter.check(message.author.id);
  if (!rateLimit.allowed) {
    const retrySeconds = Math.ceil((rateLimit.retryAfterMs ?? 1e3) / 1e3);
    await message.reply(
      `Slow down! Try again in ${retrySeconds}s.`
    ).catch(() => {
    });
    return true;
  }
  const parts = afterPrefix.split(/\s+/);
  const actionName = parts[0]?.toLowerCase();
  if (!actionName) {
    await message.reply(buildActionsHelp()).catch(() => {
    });
    return true;
  }
  const action = (0, import_definitions.getAction)(actionName);
  if (!action) {
    await message.reply(
      `Unknown action: \`${actionName}\`. Type \`ash actions\` to see available actions.`
    ).catch(() => {
    });
    return true;
  }
  const cooldown = checkCooldown(message.author.id, action.name, action.cooldownMs);
  if (!cooldown.allowed) {
    const retrySeconds = Math.ceil((cooldown.retryAfterMs ?? 1e3) / 1e3);
    const emoteStr = action.emoteName ? (0, import_anime_emotes.animeEmote)(action.emoteName) : action.emoji;
    await message.reply(
      `${emoteStr} \`${action.name}\` is on cooldown. Try again in ${retrySeconds}s.`
    ).catch(() => {
    });
    return true;
  }
  const botId = client.user?.id ?? "";
  let targetId = await resolveTarget(message, parts);
  if (action.targetRequired && !targetId) {
    const emoteStr = action.emoteName ? (0, import_anime_emotes.animeEmote)(action.emoteName) : action.emoji;
    await message.reply(
      `${emoteStr} Who should ${actionName}? Usage: \`ash ${actionName} @user\``
    ).catch(() => {
    });
    return true;
  }
  if (!action.targetRequired && !targetId) {
    targetId = message.author.id;
  }
  if (targetId === message.author.id && !action.selfTargetAllowed) {
    const emoteStr = action.emoteName ? (0, import_anime_emotes.animeEmote)(action.emoteName) : action.emoji;
    await message.reply(
      `${emoteStr} You can't use \`${actionName}\` on yourself!`
    ).catch(() => {
    });
    return true;
  }
  if (targetId === botId && !action.botTargetAllowed) {
    const emoteStr = action.emoteName ? (0, import_anime_emotes.animeEmote)(action.emoteName) : action.emoji;
    await message.reply(
      `${emoteStr} AshenAI refuses to be a target for that!`
    ).catch(() => {
    });
    return true;
  }
  const result = await (0, import_engine.executeAction)(actionName, message, targetId, botId);
  if (!result) {
    await message.reply(`Unknown action: \`${actionName}\`.`).catch(() => {
    });
    return true;
  }
  try {
    const response = await (0, import_engine.buildDiscordResponse)(result);
    await message.reply(response).catch(() => {
    });
  } catch (error) {
    import_logger.logger.warn(`Anime action failed: ${error instanceof Error ? error.message : String(error)}`);
    await message.reply(result.text).catch(() => {
    });
  }
  return true;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleAnimeAction,
  isAnimeActionPrefix
});
