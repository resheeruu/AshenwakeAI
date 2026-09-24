/* ================================================================
 * ANIME ACTION PREFIX HANDLER
 *
 * Parses "ash <action> @user" messages and dispatches to the
 * action engine. Integrates with the existing MessageCreate handler.
 * Supports: explicit mentions, reply-based targeting, raw IDs.
 * ================================================================ */

import type { Message, Client } from "discord.js";
import { UserRateLimiter } from "../../security/rate-limit";
import { logger } from "../../logger";
import { getAction, getAllActions, getActionsByCategory, type ActionCategory } from "./definitions";
import { executeAction, buildDiscordResponse } from "./engine";
import { animeEmote, type AnimeEmoteName } from "../../discord/anime-emotes";

const PREFIX = "ash ";
const actionRateLimiter = new UserRateLimiter(15, 60_000);

/* ================================================================
 * PER-ACTION COOLDOWN TRACKING
 * ================================================================ */

const actionCooldowns = new Map<string, number>();

function checkCooldown(userId: string, actionName: string, cooldownMs: number): { allowed: boolean; retryAfterMs?: number } {
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

const COOLDOWN_CLEANUP_INTERVAL = 5 * 60 * 1000;
const COOLDOWN_MAX_AGE = 60 * 60 * 1000;
const cooldownCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of actionCooldowns) {
    if (now - timestamp > COOLDOWN_MAX_AGE) {
      actionCooldowns.delete(key);
    }
  }
}, COOLDOWN_CLEANUP_INTERVAL);
cooldownCleanupTimer.unref();

/* ================================================================
 * HELP TEXT — dynamically derived from registry
 * ================================================================ */

const CATEGORY_META: Record<ActionCategory, { emoji: string; label: string }> = {
  affection: { emoji: "[affection]", label: "AFFECTION" },
  combat: { emoji: "[combat]", label: "COMBAT" },
  fun: { emoji: "[fun]", label: "FUN" },
};

function buildActionsHelp(): string {
  const lines: string[] = ["**ANIME ACTIONS**", ""];

  for (const category of ["affection", "combat", "fun"] as ActionCategory[]) {
    const meta = CATEGORY_META[category];
    const actions = getActionsByCategory(category);
    const names = actions.map((a) => `\`${a.name}\``).join(" \u2022 ");
    lines.push(`**${meta.label}**`);
    lines.push(names);
    lines.push("");
  }

  lines.push("**Usage:**");
  lines.push("  `ash <action> @user` — target a mentioned user");
  lines.push("  `ash <action>` — self-target (for actions that support it)");
  lines.push("  Reply to a message with `ash <action>` to target that user");
  lines.push("");
  lines.push("**Examples:**");
  lines.push("  `ash hug @friend` \u2022 `ash punch @rival` \u2022 `ash dance`");
  lines.push("  `ash cry` \u2022 `ash blush` \u2022 `ash celebrate`");
  lines.push("");
  lines.push("**Aliases:** `h`=hug, `pu`=punch, `hp`=headpat, `sl`=slap, `hf`=highfive");

  return lines.join("\n");
}

/* ================================================================
 * TARGET RESOLUTION
 * ================================================================ */

async function resolveTarget(
  message: Message,
  parts: string[],
): Promise<string | null> {
  // 1. Explicit Discord mention
  if (message.mentions.users.size > 0) {
    const mentioned = message.mentions.users.first();
    if (mentioned) return mentioned.id;
  }

  // 2. Reply-based targeting
  if (message.reference?.messageId) {
    const referenceId = message.reference.messageId;
    const cached = message.channel.messages.cache.get(referenceId);

    if (cached) {
      if (cached.author.id !== message.author.id) {
        return cached.author.id;
      }
    } else {
      /*
       * Not in cache — fetch it from Discord so the documented
       * "reply to a message with `ash <action>`" flow works reliably.
       */
      try {
        const referenced = await message.fetchReference();
        if (referenced.author.id !== message.author.id) {
          return referenced.author.id;
        }
      } catch {
        // Deleted or inaccessible referenced message — fall through.
      }
    }
  }

  // 3. Raw Discord user ID (safe validation)
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

/* ================================================================
 * PREFIX COMMAND PARSER
 * ================================================================ */

export function isAnimeActionPrefix(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  return trimmed === "ash" || trimmed.startsWith("ash ");
}

export async function handleAnimeAction(
  message: Message,
  client: Client,
): Promise<boolean> {
  const content = message.content.trim();
  if (!isAnimeActionPrefix(content)) return false;

  const afterPrefix = content.slice(3).trim();
  if (!afterPrefix) {
    await message.reply(buildActionsHelp()).catch(() => {});
    return true;
  }

  if (afterPrefix.toLowerCase() === "actions") {
    await message.reply(buildActionsHelp()).catch(() => {});
    return true;
  }

  const rateLimit = actionRateLimiter.check(message.author.id);
  if (!rateLimit.allowed) {
    const retrySeconds = Math.ceil((rateLimit.retryAfterMs ?? 1000) / 1000);
    await message.reply(
      `Slow down! Try again in ${retrySeconds}s.`
    ).catch(() => {});
    return true;
  }

  const parts = afterPrefix.split(/\s+/);
  const actionName = parts[0]?.toLowerCase();
  if (!actionName) {
    await message.reply(buildActionsHelp()).catch(() => {});
    return true;
  }

  const action = getAction(actionName);
  if (!action) {
    await message.reply(
      `Unknown action: \`${actionName}\`. Type \`ash actions\` to see available actions.`
    ).catch(() => {});
    return true;
  }

  const cooldown = checkCooldown(message.author.id, action.name, action.cooldownMs);
  if (!cooldown.allowed) {
    const retrySeconds = Math.ceil((cooldown.retryAfterMs ?? 1000) / 1000);
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await message.reply(
      `${emoteStr} \`${action.name}\` is on cooldown. Try again in ${retrySeconds}s.`
    ).catch(() => {});
    return true;
  }

  const botId = client.user?.id ?? "";
  let targetId = await resolveTarget(message, parts);

  if (action.targetRequired && !targetId) {
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await message.reply(
      `${emoteStr} Who should ${actionName}? Usage: \`ash ${actionName} @user\``
    ).catch(() => {});
    return true;
  }

  if (!action.targetRequired && !targetId) {
    targetId = message.author.id;
  }

  if (targetId === message.author.id && !action.selfTargetAllowed) {
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await message.reply(
      `${emoteStr} You can't use \`${actionName}\` on yourself!`
    ).catch(() => {});
    return true;
  }

  if (targetId === botId && !action.botTargetAllowed) {
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await message.reply(
      `${emoteStr} AshenAI refuses to be a target for that!`
    ).catch(() => {});
    return true;
  }

  const result = await executeAction(actionName, message, targetId, botId);
  if (!result) {
    await message.reply(`Unknown action: \`${actionName}\`.`).catch(() => {});
    return true;
  }

  try {
    const response = await buildDiscordResponse(result);
    await message.reply(response).catch(() => {});
  } catch (error) {
    logger.warn(`Anime action failed: ${error instanceof Error ? error.message : String(error)}`);
    await message.reply(result.text).catch(() => {});
  }

  return true;
}
