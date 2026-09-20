/* ================================================================
 * ANIME ACTION PREFIX HANDLER
 *
 * Parses "ash <action> @user" messages and dispatches to the
 * action engine. Integrates with the existing MessageCreate handler.
 * ================================================================ */

import type { Message, Client } from "discord.js";
import { UserRateLimiter } from "../../security/rate-limit";
import { logger } from "../../logger";
import { getAction, getAllActions, getActionsByCategory } from "./definitions";
import { executeAction, buildDiscordResponse } from "./engine";

const PREFIX = "ash ";
const actionRateLimiter = new UserRateLimiter(15, 60_000);

/* ================================================================
 * HELP TEXT
 * ================================================================ */

function buildActionsHelp(): string {
  const lines: string[] = [
    "**ANIME ACTIONS**",
    "",
    "\u{1F497} **AFFECTION**",
    "`hug` \u2022 `cuddle` \u2022 `pat` \u2022 `headpat` \u2022 `kiss`",
    "",
    "\u{1F94A} **COMBAT**",
    "`punch` \u2022 `kick` \u2022 `slap` \u2022 `bonk` \u2022 `bite`",
    "",
    "\u2728 **FUN**",
    "`poke` \u2022 `wave` \u2022 `highfive` \u2022 `yeet`",
    "",
    "**Usage:** `ash <action> @user` or `ash <action>`",
    "**Aliases:** `ash h @user` (hug), `ash pu @user` (punch), `ash hp @user` (headpat)",
    "**Special:** `ash actions` to see all actions",
  ];
  return lines.join("\n");
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

  const botId = client.user?.id ?? "";
  let targetId: string | null = null;

  if (message.mentions.users.size > 0) {
    const mentioned = message.mentions.users.first();
    if (mentioned) targetId = mentioned.id;
  } else if (parts[1]) {
    const idMatch = parts[1].match(/^<?@?!?(\d{17,20})>?$/);
    if (idMatch) {
      targetId = idMatch[1];
    } else if (/^\d{17,20}$/.test(parts[1])) {
      targetId = parts[1];
    }
  }

  if (action.targetRequired && !targetId) {
    await message.reply(
      `${action.emoji} Who should ${actionName}? Usage: \`ash ${actionName} @user\``
    ).catch(() => {});
    return true;
  }

  if (!action.targetRequired && !targetId) {
    targetId = message.author.id;
  }

  if (targetId === message.author.id && !action.selfTargetAllowed) {
    await message.reply(
      `${action.emoji} You can't use \`${actionName}\` on yourself!`
    ).catch(() => {});
    return true;
  }

  if (targetId === botId && !action.botTargetAllowed) {
    await message.reply(
      `${action.emoji} AshenAI refuses to be a target for that!`
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
