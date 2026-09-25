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
import { fetchAnimation, type FetchAnimationOptions } from "./providers";
import { safeMediaFetch, validateMediaUrl } from "./media-security";
import { readLocalGif, type LocalGifAsset } from "../../media/local-gifs";
import { animeEmote, type AnimeEmoteName } from "../../discord/anime-emotes";
import { logger } from "../../logger";

export interface ActionResult {
  text: string;
  animationUrl?: string;
  animationSource?: string;
  /**
   * POSIX path (relative to the local media root) of a validated
   * local asset. Never sent to users — logging/tests only.
   */
  localMediaPath?: string;
  /** Full asset needed by buildDiscordResponse for secure revalidation. */
  localMediaAsset?: LocalGifAsset;
}

/* ================================================================
 * ACTION EXECUTION
 * ================================================================ */

export async function executeAction(
  actionName: string,
  message: Message,
  targetId: string | null,
  botId: string,
  options: FetchAnimationOptions = {},
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

  const animation = await fetchAnimation(action.mediaKey, options);

  const outcomeSuffix = outcome ? ` [${outcome}]` : "";
  const emoteStr = action.emoteName
    ? animeEmote(action.emoteName as AnimeEmoteName)
    : action.emoji;
  const finalText = `${emoteStr} ${text}${outcomeSuffix}`;

  if (animation?.localAsset) {
    return {
      text: finalText,
      animationSource: animation.source,
      localMediaPath: animation.localAsset.relPath,
      localMediaAsset: animation.localAsset,
    };
  }

  if (animation?.url) {
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
  // 1) LOCAL MEDIA — preferred when present, fully revalidated on read.
  //    Local filesystem paths are never included in user-facing content.
  if (result.localMediaAsset) {
    const startedAt = Date.now();
    const local = await readLocalGif(result.localMediaAsset);
    if (local) {
      const ext = local.contentType.includes("webp")
        ? "webp"
        : local.contentType.includes("png")
          ? "png"
          : local.contentType.includes("jpeg")
            ? "jpg"
            : "gif";

      logger.debug(
        `anime_media result=local_success source=${result.animationSource ?? "local"} bytes=${local.buffer.byteLength} contentType=${local.contentType} elapsed=${Date.now() - startedAt}ms`,
      );

      const attachment = new AttachmentBuilder(local.buffer, {
        name: `anime.${ext}`,
      });
      return { content: result.text, files: [attachment] };
    }

    logger.warn(
      `anime_media result=local_read_failed source=${result.animationSource ?? "local"} detail=revalidation_failed elapsed=${Date.now() - startedAt}ms fallback=text`,
    );
    return { content: result.text };
  }

  if (!result.animationUrl) {
    return { content: result.text };
  }

  const urlCheck = validateMediaUrl(result.animationUrl);
  if (!urlCheck.ok) {
    logger.warn(
      `anime_media result=url_rejected source=${result.animationSource ?? "unknown"} detail=${(urlCheck.error ?? "unknown").replace(/\s+/g, "_")} fallback=text`,
    );
    return { content: result.text };
  }

  const startedAt = Date.now();
  const media = await safeMediaFetch(result.animationUrl);
  if (!media) {
    logger.warn(
      `anime_media result=fetch_failed source=${result.animationSource ?? "unknown"} elapsed=${Date.now() - startedAt}ms fallback=text`,
    );
    return { content: result.text };
  }

  logger.debug(
    `anime_media result=success source=${result.animationSource ?? "unknown"} bytes=${media.buffer.byteLength} contentType=${media.contentType} elapsed=${Date.now() - startedAt}ms`,
  );

  let ext = "gif";
  if (media.contentType.includes("webp")) ext = "webp";
  else if (media.contentType.includes("png")) ext = "png";
  else if (media.contentType.includes("jpeg")) ext = "jpg";

  const attachment = new AttachmentBuilder(media.buffer, {
    name: `anime.${ext}`,
  });

  return {
    content: result.text,
    files: [attachment],
  };
}
