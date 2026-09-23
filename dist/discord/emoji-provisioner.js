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
var emoji_provisioner_exports = {};
__export(emoji_provisioner_exports, {
  applyEnvOverrides: () => applyEnvOverrides,
  getAnimeEmoteId: () => getAnimeEmoteId,
  getIconId: () => getIconId,
  getProvisionResult: () => getProvisionResult,
  getProvisionedGuildId: () => getProvisionedGuildId,
  provisionEmojis: () => provisionEmojis,
  resetProvisioner: () => resetProvisioner
});
module.exports = __toCommonJS(emoji_provisioner_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_icons = require("./icons");
var import_anime_emotes = require("./anime-emotes");
function getLogger() {
  const { logger } = require("../logger");
  return logger;
}
let _resolved = null;
const PNG_DIR = (0, import_node_path.join)(process.cwd(), "assets", "emojis", "png");
async function provisionEmojis(guild) {
  if (_resolved) return _resolved;
  const result = {
    icons: {},
    animeEmotes: {},
    guildId: guild.id,
    uploaded: 0,
    existing: 0,
    hadErrors: false
  };
  try {
    const existingEmojis = await guild.emojis.fetch();
    getLogger().info(`Emoji provisioner: found ${existingEmojis.size} existing emojis in guild ${guild.name}`);
    const existingByName = /* @__PURE__ */ new Map();
    for (const [, emoji] of existingEmojis) {
      existingByName.set(emoji.name, emoji.id);
    }
    for (const name of import_icons.ICON_NAMES) {
      const config = import_icons.ICON_MAP[name];
      const legacyName = import_icons.LOGICAL_TO_LEGACY[name];
      const foundId = existingByName.get(legacyName) ?? existingByName.get(name);
      if (foundId) {
        result.icons[name] = foundId;
        result.existing++;
        continue;
      }
      const pngPath = (0, import_node_path.join)(PNG_DIR, `${legacyName}.png`);
      if ((0, import_node_fs.existsSync)(pngPath)) {
        const uploaded = await uploadEmojiToGuild(guild, legacyName, pngPath);
        if (uploaded) {
          result.icons[name] = uploaded;
          result.uploaded++;
        } else {
          result.hadErrors = true;
        }
      } else {
        getLogger().debug(`Emoji provisioner: PNG not found for ${legacyName}, skipping upload`);
      }
    }
    for (const name of import_anime_emotes.ANIME_EMOTE_NAMES) {
      const config = import_anime_emotes.ANIME_EMOTE_MAP[name];
      const foundId = existingByName.get(config.discordName);
      if (foundId) {
        result.animeEmotes[name] = foundId;
        result.existing++;
        continue;
      }
      const pngPath = (0, import_node_path.join)(PNG_DIR, `${config.discordName}.png`);
      if ((0, import_node_fs.existsSync)(pngPath)) {
        const uploaded = await uploadEmojiToGuild(guild, config.discordName, pngPath);
        if (uploaded) {
          result.animeEmotes[name] = uploaded;
          result.uploaded++;
        } else {
          result.hadErrors = true;
        }
      }
    }
    getLogger().info(
      `Emoji provisioner: ${result.existing} existing, ${result.uploaded} uploaded, ${result.hadErrors ? "some errors" : "no errors"}`
    );
  } catch (error) {
    getLogger().warn(`Emoji provisioner failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
    result.hadErrors = true;
  }
  _resolved = result;
  return result;
}
function getProvisionResult() {
  return _resolved;
}
function getIconId(name) {
  return _resolved?.icons[name];
}
function getAnimeEmoteId(name) {
  return _resolved?.animeEmotes[name];
}
function getProvisionedGuildId() {
  return _resolved?.guildId;
}
function resetProvisioner() {
  _resolved = null;
}
async function uploadEmojiToGuild(guild, name, imagePath) {
  try {
    const pngBuffer = (0, import_node_fs.readFileSync)(imagePath);
    const formData = new FormData();
    formData.append("file", new Blob([pngBuffer], { type: "image/png" }), `${name}.png`);
    formData.append("name", name);
    const response = await guild.emojis.create({
      attachment: imagePath,
      name
    });
    getLogger().info(`Emoji provisioner: uploaded ${name} \u2192 ID: ${response.id}`);
    return response.id;
  } catch (error) {
    getLogger().warn(`Emoji provisioner: failed to upload ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function applyEnvOverrides(result) {
  for (const name of import_icons.ICON_NAMES) {
    const config = import_icons.ICON_MAP[name];
    const envId = process.env[config.envVar]?.trim();
    if (envId) {
      result.icons[name] = envId;
    }
  }
  for (const name of import_anime_emotes.ANIME_EMOTE_NAMES) {
    const config = import_anime_emotes.ANIME_EMOTE_MAP[name];
    const envId = process.env[config.envVar]?.trim();
    if (envId) {
      result.animeEmotes[name] = envId;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  applyEnvOverrides,
  getAnimeEmoteId,
  getIconId,
  getProvisionResult,
  getProvisionedGuildId,
  provisionEmojis,
  resetProvisioner
});
