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
var emojis_exports = {};
__export(emojis_exports, {
  E_AI: () => E_AI,
  E_ANGRY: () => E_ANGRY,
  E_ARROW: () => E_ARROW,
  E_CONFUSED: () => E_CONFUSED,
  E_DEGRADED: () => E_DEGRADED,
  E_ERROR: () => E_ERROR,
  E_FOCUS: () => E_FOCUS,
  E_HAPPY: () => E_HAPPY,
  E_INFO: () => E_INFO,
  E_LAUGH: () => E_LAUGH,
  E_LOADING: () => E_LOADING,
  E_MEMORY: () => E_MEMORY,
  E_MENU: () => E_MENU,
  E_OFFLINE: () => E_OFFLINE,
  E_ONLINE: () => E_ONLINE,
  E_REFRESH: () => E_REFRESH,
  E_SAD: () => E_SAD,
  E_SETTINGS: () => E_SETTINGS,
  E_SHY: () => E_SHY,
  E_SLEEP: () => E_SLEEP,
  E_STATS: () => E_STATS,
  E_SUCCESS: () => E_SUCCESS,
  E_SURPRISED: () => E_SURPRISED,
  E_THINK: () => E_THINK,
  E_WARNING: () => E_WARNING,
  allEmojiAssets: () => allEmojiAssets,
  configuredEmojis: () => configuredEmojis,
  emoji: () => emoji,
  emojiAssetPath: () => emojiAssetPath,
  emojiGuildId: () => emojiGuildId,
  emojiId: () => emojiId,
  hasCustomEmoji: () => hasCustomEmoji,
  unicodeFallback: () => unicodeFallback
});
module.exports = __toCommonJS(emojis_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_icons = require("./icons");
var import_emoji_provisioner = require("./emoji-provisioner");
let _guildId;
let _resolvedIds = {};
let _initialized = false;
function init() {
  if (_initialized) return;
  _initialized = true;
  const provisioned = (0, import_emoji_provisioner.getProvisionResult)();
  if (provisioned) {
    _guildId = provisioned.guildId;
    for (const [name, id] of Object.entries(provisioned.icons)) {
      _resolvedIds[name] = id;
    }
    (0, import_emoji_provisioner.applyEnvOverrides)(provisioned);
  }
  if (!_guildId) {
    for (const [name, config] of Object.entries(import_icons.ICON_MAP)) {
      const id = process.env[config.envVar]?.trim();
      if (id) {
        _resolvedIds[name] = id;
      }
    }
    _guildId = process.env.DISCORD_GUILD_ID?.trim();
  }
  if (!_guildId) {
    try {
      const manifestPath = (0, import_node_path.join)(process.cwd(), "assets", "emojis", "emoji-manifest.json");
      if ((0, import_node_fs.existsSync)(manifestPath)) {
        const manifest = JSON.parse((0, import_node_fs.readFileSync)(manifestPath, "utf-8"));
        if (manifest.guildId && !_guildId) {
          _guildId = manifest.guildId;
        }
        if (manifest.emojis && typeof manifest.emojis === "object") {
          for (const [legacyName, id] of Object.entries(manifest.emojis)) {
            if (typeof id === "string") {
              const logical = import_icons.LEGACY_TO_LOGICAL[legacyName] ?? (import_icons.ICON_NAMES.includes(legacyName) ? legacyName : void 0);
              if (logical && !_resolvedIds[logical]) {
                _resolvedIds[logical] = id;
              }
            }
          }
        }
      }
    } catch {
    }
  }
}
function toLogical(name) {
  if (name in import_icons.LEGACY_TO_LOGICAL) {
    return import_icons.LEGACY_TO_LOGICAL[name];
  }
  if (import_icons.ICON_NAMES.includes(name)) {
    return name;
  }
  throw new Error(`Unknown emoji name: ${name}`);
}
function emoji(name) {
  init();
  const logical = toLogical(name);
  const id = _resolvedIds[logical];
  const legacyName = `ash_${logical}`;
  if (id && _guildId) {
    return `<:${legacyName}:${id}>`;
  }
  return import_icons.ICON_MAP[logical].fallback;
}
function emojiId(name) {
  init();
  const logical = toLogical(name);
  return _resolvedIds[logical];
}
function emojiGuildId() {
  init();
  return _guildId;
}
function unicodeFallback(name) {
  const logical = toLogical(name);
  return import_icons.ICON_MAP[logical].fallback;
}
function hasCustomEmoji(name) {
  init();
  const logical = toLogical(name);
  return !!_resolvedIds[logical] && !!_guildId;
}
function configuredEmojis() {
  init();
  return { ..._resolvedIds };
}
function emojiAssetPath(name) {
  const logical = toLogical(name);
  const pngPath = (0, import_node_path.join)(process.cwd(), "assets", "emojis", "png", `ash_${logical}.png`);
  return (0, import_node_fs.existsSync)(pngPath) ? pngPath : void 0;
}
function allEmojiAssets() {
  const result = {};
  for (const name of import_icons.ICON_NAMES) {
    result[name] = emojiAssetPath(name);
  }
  return result;
}
const E_SUCCESS = () => emoji("success");
const E_ERROR = () => emoji("error");
const E_WARNING = () => emoji("warning");
const E_INFO = () => emoji("info");
const E_AI = () => emoji("ai");
const E_LOADING = () => emoji("loading");
const E_ONLINE = () => emoji("online");
const E_OFFLINE = () => emoji("offline");
const E_DEGRADED = () => emoji("degraded");
const E_SETTINGS = () => emoji("settings");
const E_ARROW = () => emoji("arrow");
const E_MENU = () => emoji("menu");
const E_REFRESH = () => emoji("refresh");
const E_MEMORY = () => emoji("memory");
const E_STATS = () => emoji("stats");
const E_THINK = () => emoji("think");
const E_HAPPY = () => emoji("happy");
const E_SAD = () => emoji("sad");
const E_ANGRY = () => emoji("angry");
const E_CONFUSED = () => emoji("confused");
const E_SHY = () => emoji("shy");
const E_SURPRISED = () => emoji("surprised");
const E_SLEEP = () => emoji("sleep");
const E_FOCUS = () => emoji("focus");
const E_LAUGH = () => emoji("laugh");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  E_AI,
  E_ANGRY,
  E_ARROW,
  E_CONFUSED,
  E_DEGRADED,
  E_ERROR,
  E_FOCUS,
  E_HAPPY,
  E_INFO,
  E_LAUGH,
  E_LOADING,
  E_MEMORY,
  E_MENU,
  E_OFFLINE,
  E_ONLINE,
  E_REFRESH,
  E_SAD,
  E_SETTINGS,
  E_SHY,
  E_SLEEP,
  E_STATS,
  E_SUCCESS,
  E_SURPRISED,
  E_THINK,
  E_WARNING,
  allEmojiAssets,
  configuredEmojis,
  emoji,
  emojiAssetPath,
  emojiGuildId,
  emojiId,
  hasCustomEmoji,
  unicodeFallback
});
