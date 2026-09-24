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
var engine_exports = {};
__export(engine_exports, {
  buildDiscordResponse: () => buildDiscordResponse,
  executeAction: () => executeAction
});
module.exports = __toCommonJS(engine_exports);
var import_discord = require("discord.js");
var import_definitions = require("./definitions");
var import_providers = require("./providers");
var import_media_security = require("./media-security");
var import_anime_emotes = require("../../discord/anime-emotes");
var import_logger = require("../../logger");
async function executeAction(actionName, message, targetId, botId) {
  const action = (0, import_definitions.getAction)(actionName);
  if (!action) return null;
  const authorName = message.member?.displayName ?? message.author.username;
  const isBotTarget = targetId === botId;
  const isSelfTarget = targetId === message.author.id;
  let targetName = null;
  if (targetId && !isBotTarget) {
    const targetMember = await message.guild?.members.fetch(targetId).catch(() => null);
    targetName = targetMember?.displayName ?? "someone";
  } else if (isBotTarget) {
    targetName = "AshenAI";
  }
  const { text, outcome } = (0, import_definitions.resolveResponse)(
    action,
    authorName,
    targetName,
    isBotTarget,
    isSelfTarget
  );
  const animation = await (0, import_providers.fetchAnimation)(action.mediaKey);
  const outcomeSuffix = outcome ? ` [${outcome}]` : "";
  const emoteStr = action.emoteName ? (0, import_anime_emotes.animeEmote)(action.emoteName) : action.emoji;
  const finalText = `${emoteStr} ${text}${outcomeSuffix}`;
  if (animation) {
    return {
      text: finalText,
      animationUrl: animation.url,
      animationSource: animation.source
    };
  }
  return { text: finalText };
}
async function buildDiscordResponse(result) {
  if (!result.animationUrl) {
    return { content: result.text };
  }
  const urlCheck = (0, import_media_security.validateMediaUrl)(result.animationUrl);
  if (!urlCheck.ok) {
    import_logger.logger.warn(
      `anime_media result=url_rejected source=${result.animationSource ?? "unknown"} detail=${(urlCheck.error ?? "unknown").replace(/\s+/g, "_")} fallback=text`
    );
    return { content: result.text };
  }
  const startedAt = Date.now();
  const media = await (0, import_media_security.safeMediaFetch)(result.animationUrl);
  if (!media) {
    import_logger.logger.warn(
      `anime_media result=fetch_failed source=${result.animationSource ?? "unknown"} elapsed=${Date.now() - startedAt}ms fallback=text`
    );
    return { content: result.text };
  }
  import_logger.logger.debug(
    `anime_media result=success source=${result.animationSource ?? "unknown"} bytes=${media.buffer.byteLength} contentType=${media.contentType} elapsed=${Date.now() - startedAt}ms`
  );
  let ext = "gif";
  if (media.contentType.includes("webp")) ext = "webp";
  else if (media.contentType.includes("png")) ext = "png";
  else if (media.contentType.includes("jpeg")) ext = "jpg";
  const attachment = new import_discord.AttachmentBuilder(media.buffer, {
    name: `anime.${ext}`
  });
  return {
    content: result.text,
    files: [attachment]
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildDiscordResponse,
  executeAction
});
