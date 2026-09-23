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
var icons_exports = {};
__export(icons_exports, {
  ICON_MAP: () => ICON_MAP,
  ICON_NAMES: () => ICON_NAMES,
  LEGACY_TO_LOGICAL: () => LEGACY_TO_LOGICAL,
  LOGICAL_TO_LEGACY: () => LOGICAL_TO_LEGACY,
  TABLER_BASE_URL: () => TABLER_BASE_URL,
  TABLER_PACKAGE_URL: () => TABLER_PACKAGE_URL,
  iconPngExists: () => iconPngExists,
  iconPngPath: () => iconPngPath,
  iconSvgExists: () => iconSvgExists,
  iconSvgPath: () => iconSvgPath,
  iconUpstreamUrl: () => iconUpstreamUrl
});
module.exports = __toCommonJS(icons_exports);
var import_node_path = require("node:path");
var import_node_fs = require("node:fs");
const ICON_MAP = {
  ai: { tabler: "robot", color: "#7c3aed", fallback: "\u{1F916}", envVar: "EMOJI_ASH_AI_ID" },
  success: { tabler: "circle-check", color: "#22c55e", fallback: "\u2705", envVar: "EMOJI_ASH_SUCCESS_ID" },
  error: { tabler: "circle-x", color: "#ef4444", fallback: "\u274C", envVar: "EMOJI_ASH_ERROR_ID" },
  warning: { tabler: "alert-triangle", color: "#f59e0b", fallback: "\u26A0\uFE0F", envVar: "EMOJI_ASH_WARNING_ID" },
  info: { tabler: "info-circle", color: "#3b82f6", fallback: "\u{1F4A1}", envVar: "EMOJI_ASH_INFO_ID" },
  loading: { tabler: "loader", color: "#7c3aed", fallback: "\u23F3", envVar: "EMOJI_ASH_LOADING_ID" },
  online: { tabler: "heartbeat", color: "#22c55e", fallback: "\u{1F7E2}", envVar: "EMOJI_ASH_ONLINE_ID" },
  offline: { tabler: "circle-off", color: "#ef4444", fallback: "\u{1F534}", envVar: "EMOJI_ASH_OFFLINE_ID" },
  degraded: { tabler: "alert-octagon", color: "#f59e0b", fallback: "\u{1F7E1}", envVar: "EMOJI_ASH_DEGRADED_ID" },
  settings: { tabler: "settings", color: "#7c3aed", fallback: "\u2699\uFE0F", envVar: "EMOJI_ASH_SETTINGS_ID" },
  arrow: { tabler: "arrow-right", color: "#7c3aed", fallback: "\u27A1\uFE0F", envVar: "EMOJI_ASH_ARROW_ID" },
  menu: { tabler: "menu-2", color: "#7c3aed", fallback: "\u{1F4CB}", envVar: "EMOJI_ASH_MENU_ID" },
  refresh: { tabler: "refresh", color: "#7c3aed", fallback: "\u{1F504}", envVar: "EMOJI_ASH_REFRESH_ID" },
  memory: { tabler: "brain", color: "#7c3aed", fallback: "\u{1F9E0}", envVar: "EMOJI_ASH_MEMORY_ID" },
  stats: { tabler: "chart-bar", color: "#7c3aed", fallback: "\u{1F4CA}", envVar: "EMOJI_ASH_STATS_ID" },
  think: { tabler: "brain", color: "#7c3aed", fallback: "\u{1F914}", envVar: "EMOJI_ASH_THINK_ID" },
  happy: { tabler: "mood-happy", color: "#22c55e", fallback: "\u{1F60A}", envVar: "EMOJI_ASH_HAPPY_ID" },
  sad: { tabler: "mood-sad", color: "#3b82f6", fallback: "\u{1F622}", envVar: "EMOJI_ASH_SAD_ID" },
  angry: { tabler: "mood-angry", color: "#ef4444", fallback: "\u{1F620}", envVar: "EMOJI_ASH_ANGRY_ID" },
  confused: { tabler: "mood-confused", color: "#f59e0b", fallback: "\u{1F615}", envVar: "EMOJI_ASH_CONFUSED_ID" },
  shy: { tabler: "mood-happy", color: "#ec4899", fallback: "\u{1F60A}", envVar: "EMOJI_ASH_SHY_ID" },
  surprised: { tabler: "mood-smile", color: "#8b5cf6", fallback: "\u{1F62E}", envVar: "EMOJI_ASH_SURPRISED_ID" },
  sleep: { tabler: "moon", color: "#6b7280", fallback: "\u{1F634}", envVar: "EMOJI_ASH_SLEEP_ID" },
  focus: { tabler: "mood-search", color: "#3b82f6", fallback: "\u{1F9D0}", envVar: "EMOJI_ASH_FOCUS_ID" },
  laugh: { tabler: "mood-smile", color: "#22c55e", fallback: "\u{1F604}", envVar: "EMOJI_ASH_LAUGH_ID" }
};
const ICON_NAMES = Object.keys(ICON_MAP);
const LEGACY_TO_LOGICAL = {};
for (const name of ICON_NAMES) {
  LEGACY_TO_LOGICAL[`ash_${name}`] = name;
}
const LOGICAL_TO_LEGACY = {};
for (const name of ICON_NAMES) {
  LOGICAL_TO_LEGACY[name] = `ash_${name}`;
}
const TABLER_BASE_URL = "https://unpkg.com/@tabler/icons@3.31.0/icons/outline";
const TABLER_PACKAGE_URL = "https://unpkg.com/@tabler/icons@3.31.0/package.json";
const ASSETS_DIR = (0, import_node_path.join)(process.cwd(), "assets", "emojis");
function iconSvgPath(name) {
  return (0, import_node_path.join)(ASSETS_DIR, "svg", `ash_${name}.svg`);
}
function iconPngPath(name) {
  return (0, import_node_path.join)(ASSETS_DIR, "png", `ash_${name}.png`);
}
function iconUpstreamUrl(name) {
  return `${TABLER_BASE_URL}/${ICON_MAP[name].tabler}.svg`;
}
function iconSvgExists(name) {
  return (0, import_node_fs.existsSync)(iconSvgPath(name));
}
function iconPngExists(name) {
  return (0, import_node_fs.existsSync)(iconPngPath(name));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ICON_MAP,
  ICON_NAMES,
  LEGACY_TO_LOGICAL,
  LOGICAL_TO_LEGACY,
  TABLER_BASE_URL,
  TABLER_PACKAGE_URL,
  iconPngExists,
  iconPngPath,
  iconSvgExists,
  iconSvgPath,
  iconUpstreamUrl
});
