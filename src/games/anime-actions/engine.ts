/* ================================================================
 * ANIME ACTION ENGINE
 *
 * Core engine that resolves anime actions, fetches animations,
 * and builds Discord responses. Integrates with the prefix handler.
 * ================================================================ */

import type { Message } from "discord.js";
import { AttachmentBuilder } from "discord.js";
import {
  getAction,
  resolveResponse,
  type ActionDefinition,
} from "./definitions";
import { fetchAnimation } from "./providers";
import { logger } from "../../logger";

export interface ActionResult {
  text: string;
  animationUrl?: string;
  animationSource?: string;
}

/* ================================================================
 * ACTION EXECUTION
 * ================================================================ */

export async function executeAction(
  actionName: string,
  message: Message,
  targetId: string | null,
  botId: string,
): Promise<ActionResult | null> {
  const action = getAction(actionName);
  if (!action) return null;

  const authorName = message.member?.displayName ?? message.author.username;
  const isBotTarget = targetId === botId;
  const isSelfTarget = targetId === message.author.id;

  let targetName: string | null = null;
  if (targetId && !isBotTarget) {
    const targetMember = await message.guild?.members.fetch(targetId).catch(() => null);
    targetName = targetMember?.displayName ?? "someone";
  } else if (isBotTarget) {
    targetName = "AshenAI";
  }

  const { text, outcome } = resolveResponse(
    action,
    authorName,
    targetName,
    isBotTarget,
    isSelfTarget,
  );

  const animation = await fetchAnimation(action.name);

  const outcomeSuffix = outcome ? ` [${outcome}]` : "";
  const finalText = `${action.emoji} ${text}${outcomeSuffix}`;

  if (animation) {
    return {
      text: finalText,
      animationUrl: animation.url,
      animationSource: animation.source,
    };
  }

  return { text: finalText };
}

/* ================================================================
 * DISCORD RESPONSE BUILDER
 * ================================================================ */

export async function buildDiscordResponse(
  result: ActionResult,
): Promise<{ content?: string; files?: AttachmentBuilder[] }> {
  if (!result.animationUrl) {
    return { content: result.text };
  }

  try {
    const response = await fetch(result.animationUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { content: result.text };
    }

    const contentType = response.headers.get("content-type") ?? "";
    let ext = "gif";
    if (contentType.includes("webp")) ext = "webp";
    else if (contentType.includes("png")) ext = "png";

    const buffer = Buffer.from(await response.arrayBuffer());
    const attachment = new AttachmentBuilder(buffer, {
      name: `anime.${ext}`,
    });

    return {
      content: result.text,
      files: [attachment],
    };
  } catch (error) {
    logger.debug(`Failed to download animation: ${error instanceof Error ? error.message : String(error)}`);
    return { content: result.text };
  }
}
