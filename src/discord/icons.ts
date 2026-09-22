/**
 * icons.ts — Centralized AshenAI icon configuration
 *
 * Single source of truth for:
 *   - Logical icon names (what code references)
 *   - Tabler upstream icon filenames (where SVGs come from)
 *   - Unicode fallbacks (when custom Discord emoji is unavailable)
 *   - Background colors (for PNG rendering)
 *   - Discord emoji ID environment variables
 *
 * To change an icon:
 *   1. Edit ICON_MAP to point to a different Tabler icon filename
 *   2. Run: npm run icons:update
 *   3. Re-upload to Discord: npm run upload:emojis
 *
 * To add a new icon:
 *   1. Add entry to ICON_MAP
 *   2. Add entry to UNICODE_FALLBACKS
 *   3. Add entry to ENV_VAR_MAP
 *   4. Run: npm run icons:update
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IconName =
  | "ai"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading"
  | "online"
  | "offline"
  | "degraded"
  | "settings"
  | "arrow"
  | "menu"
  | "refresh"
  | "memory"
  | "stats"
  | "think"
  | "happy"
  | "sad"
  | "angry"
  | "confused"
  | "shy"
  | "surprised"
  | "sleep"
  | "focus"
  | "laugh";

export interface IconConfig {
  /** Tabler Icons outline filename (without .svg extension) */
  tabler: string;
  /** Background circle color for PNG rendering */
  color: string;
  /** Unicode emoji fallback when custom Discord emoji is unavailable */
  fallback: string;
  /** Environment variable name for the Discord custom emoji ID */
  envVar: string;
}

// ---------------------------------------------------------------------------
// Icon map — EDIT HERE to change upstream source
// ---------------------------------------------------------------------------

export const ICON_MAP: Record<IconName, IconConfig> = {
  ai:       { tabler: "robot",           color: "#7c3aed", fallback: "🤖", envVar: "EMOJI_ASH_AI_ID" },
  success:  { tabler: "circle-check",    color: "#22c55e", fallback: "✅", envVar: "EMOJI_ASH_SUCCESS_ID" },
  error:    { tabler: "circle-x",        color: "#ef4444", fallback: "❌", envVar: "EMOJI_ASH_ERROR_ID" },
  warning:  { tabler: "alert-triangle",  color: "#f59e0b", fallback: "⚠️", envVar: "EMOJI_ASH_WARNING_ID" },
  info:     { tabler: "info-circle",     color: "#3b82f6", fallback: "💡", envVar: "EMOJI_ASH_INFO_ID" },
  loading:  { tabler: "loader",          color: "#7c3aed", fallback: "⏳", envVar: "EMOJI_ASH_LOADING_ID" },
  online:   { tabler: "heartbeat",       color: "#22c55e", fallback: "🟢", envVar: "EMOJI_ASH_ONLINE_ID" },
  offline:  { tabler: "circle-off",      color: "#ef4444", fallback: "🔴", envVar: "EMOJI_ASH_OFFLINE_ID" },
  degraded: { tabler: "alert-octagon",   color: "#f59e0b", fallback: "🟡", envVar: "EMOJI_ASH_DEGRADED_ID" },
  settings: { tabler: "settings",        color: "#7c3aed", fallback: "⚙️", envVar: "EMOJI_ASH_SETTINGS_ID" },
  arrow:    { tabler: "arrow-right",     color: "#7c3aed", fallback: "➡️", envVar: "EMOJI_ASH_ARROW_ID" },
  menu:     { tabler: "menu-2",          color: "#7c3aed", fallback: "📋", envVar: "EMOJI_ASH_MENU_ID" },
  refresh:  { tabler: "refresh",         color: "#7c3aed", fallback: "🔄", envVar: "EMOJI_ASH_REFRESH_ID" },
  memory:   { tabler: "brain",           color: "#7c3aed", fallback: "🧠", envVar: "EMOJI_ASH_MEMORY_ID" },
  stats:    { tabler: "chart-bar",       color: "#7c3aed", fallback: "📊", envVar: "EMOJI_ASH_STATS_ID" },
  think:    { tabler: "brain",           color: "#7c3aed", fallback: "🤔", envVar: "EMOJI_ASH_THINK_ID" },
  happy:    { tabler: "mood-happy",      color: "#22c55e", fallback: "😊", envVar: "EMOJI_ASH_HAPPY_ID" },
  sad:      { tabler: "mood-sad",        color: "#3b82f6", fallback: "😢", envVar: "EMOJI_ASH_SAD_ID" },
  angry:    { tabler: "mood-angry",      color: "#ef4444", fallback: "😠", envVar: "EMOJI_ASH_ANGRY_ID" },
  confused: { tabler: "mood-confused",   color: "#f59e0b", fallback: "😕", envVar: "EMOJI_ASH_CONFUSED_ID" },
  shy:      { tabler: "mood-happy",      color: "#ec4899", fallback: "😊", envVar: "EMOJI_ASH_SHY_ID" },
  surprised:{ tabler: "mood-smile",      color: "#8b5cf6", fallback: "😮", envVar: "EMOJI_ASH_SURPRISED_ID" },
  sleep:    { tabler: "moon",            color: "#6b7280", fallback: "😴", envVar: "EMOJI_ASH_SLEEP_ID" },
  focus:    { tabler: "mood-search",     color: "#3b82f6", fallback: "🧐", envVar: "EMOJI_ASH_FOCUS_ID" },
  laugh:    { tabler: "mood-smile",      color: "#22c55e", fallback: "😄", envVar: "EMOJI_ASH_LAUGH_ID" },
};

// ---------------------------------------------------------------------------
// Derived constants (auto-generated from ICON_MAP — do not edit below)
// ---------------------------------------------------------------------------

/** All configured icon names */
export const ICON_NAMES: IconName[] = Object.keys(ICON_MAP) as IconName[];

/** Legacy "ash_" prefixed names for backward compatibility with Discord uploads */
export type LegacyEmojiName = `ash_${IconName}`;

/** Map from legacy ash_* name to logical name */
export const LEGACY_TO_LOGICAL: Record<LegacyEmojiName, IconName> = {} as any;
for (const name of ICON_NAMES) {
  (LEGACY_TO_LOGICAL as any)[`ash_${name}`] = name;
}

/** Map from logical name to legacy ash_* name */
export const LOGICAL_TO_LEGACY: Record<IconName, LegacyEmojiName> = {} as any;
for (const name of ICON_NAMES) {
  (LOGICAL_TO_LEGACY as any)[name] = `ash_${name}`;
}

/** Tabler upstream base URL */
export const TABLER_BASE_URL = "https://unpkg.com/@tabler/icons@3.31.0/icons/outline";

/** Tabler upstream revision tracking URL */
export const TABLER_PACKAGE_URL = "https://unpkg.com/@tabler/icons@3.31.0/package.json";

// ---------------------------------------------------------------------------
// Asset paths
// ---------------------------------------------------------------------------

import { join } from "node:path";
import { existsSync } from "node:fs";

const ASSETS_DIR = join(process.cwd(), "assets", "emojis");

/** Get the local SVG path for an icon */
export function iconSvgPath(name: IconName): string {
  return join(ASSETS_DIR, "svg", `ash_${name}.svg`);
}

/** Get the local PNG path for an icon */
export function iconPngPath(name: IconName): string {
  return join(ASSETS_DIR, "png", `ash_${name}.png`);
}

/** Get the Tabler upstream SVG URL for an icon */
export function iconUpstreamUrl(name: IconName): string {
  return `${TABLER_BASE_URL}/${ICON_MAP[name].tabler}.svg`;
}

/** Check if a local SVG exists */
export function iconSvgExists(name: IconName): boolean {
  return existsSync(iconSvgPath(name));
}

/** Check if a local PNG exists */
export function iconPngExists(name: IconName): boolean {
  return existsSync(iconPngPath(name));
}
