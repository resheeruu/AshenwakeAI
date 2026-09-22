/* ================================================================
 * ANIME EMOTES — Custom AshenAI Discord Emoji for Social/Anime
 *
 * Dedicated module for anime/social custom emoji.
 * Separate from the Tabler utility icon taxonomy (icons.ts).
 *
 * Fallback hierarchy:
 *   custom Discord emoji → plain text
 *
 * NEVER falls back to Unicode emoji.
 * ================================================================ */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/* ================================================================
 * TYPES
 * ================================================================ */

export type AnimeReactionName =
  | "happy"
  | "laugh"
  | "smug"
  | "angry"
  | "cry"
  | "blush"
  | "shock"
  | "panic"
  | "confused"
  | "sleepy"
  | "love"
  | "embarrassed"
  | "sad"
  | "excited"
  | "determined";

export type AnimeActionName =
  | "hug"
  | "cuddle"
  | "pat"
  | "headpat"
  | "kiss"
  | "slap"
  | "punch"
  | "kick"
  | "bonk"
  | "bite"
  | "poke"
  | "wave"
  | "highfive"
  | "yeet"
  | "dance"
  | "cry"
  | "blush"
  | "throw"
  | "hit"
  | "smack"
  | "tickle";

export type AnimeSystemName =
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
  | "stats";

export type AnimeEmoteName = AnimeReactionName | AnimeActionName | AnimeSystemName;

export interface AnimeEmoteConfig {
  /** Discord emoji name for upload */
  discordName: string;
  /** Environment variable for Discord emoji ID */
  envVar: string;
  /** Plain text fallback (NEVER Unicode emoji) */
  textFallback: string;
}

/* ================================================================
 * EMOTE MAP
 * ================================================================ */

export const ANIME_EMOTE_MAP: Record<AnimeEmoteName, AnimeEmoteConfig> = {
  // ── Reactions ──
  happy:       { discordName: "ash_happy",       envVar: "EMOJI_ASH_HAPPY_ID",       textFallback: ":)" },
  laugh:       { discordName: "ash_laugh",       envVar: "EMOJI_ASH_LAUGH_ID",       textFallback: "XD" },
  smug:        { discordName: "ash_smug",        envVar: "EMOJI_ASH_SMUG_ID",        textFallback: ">:)" },
  angry:       { discordName: "ash_angry",       envVar: "EMOJI_ASH_ANGRY_ID",       textFallback: ">:[" },
  cry:         { discordName: "ash_cry",         envVar: "EMOJI_ASH_CRY_ID",         textFallback: ":'(" },
  blush:       { discordName: "ash_blush",       envVar: "EMOJI_ASH_BLUSH_ID",       textFallback: ":$" },
  shock:       { discordName: "ash_shock",       envVar: "EMOJI_ASH_SHOCK_ID",       textFallback: ":O" },
  panic:       { discordName: "ash_panic",       envVar: "EMOJI_ASH_PANIC_ID",       textFallback: "D:" },
  confused:    { discordName: "ash_confused",    envVar: "EMOJI_ASH_CONFUSED_ID",    textFallback: ":/" },
  sleepy:      { discordName: "ash_sleepy",      envVar: "EMOJI_ASH_SLEEPY_ID",      textFallback: "-_-'" },
  love:        { discordName: "ash_love",        envVar: "EMOJI_ASH_LOVE_ID",        textFallback: "<3" },
  embarrassed: { discordName: "ash_embarrassed", envVar: "EMOJI_ASH_EMBARRASSED_ID", textFallback: "uwu" },
  sad:         { discordName: "ash_sad",         envVar: "EMOJI_ASH_SAD_ID",         textFallback: ":(" },
  excited:     { discordName: "ash_excited",     envVar: "EMOJI_ASH_EXCITED_ID",     textFallback: "!!" },
  determined:  { discordName: "ash_determined",  envVar: "EMOJI_ASH_DETERMINED_ID",  textFallback: ">:|" },

  // ── Actions ──
  hug:      { discordName: "ash_hug",      envVar: "EMOJI_ASH_HUG_ID",      textFallback: "[hug]" },
  cuddle:   { discordName: "ash_cuddle",   envVar: "EMOJI_ASH_CUDDLE_ID",   textFallback: "[cuddle]" },
  pat:      { discordName: "ash_pat",      envVar: "EMOJI_ASH_PAT_ID",      textFallback: "[pat]" },
  headpat:  { discordName: "ash_headpat",  envVar: "EMOJI_ASH_HEADPAT_ID",  textFallback: "[headpat]" },
  kiss:     { discordName: "ash_kiss",     envVar: "EMOJI_ASH_KISS_ID",     textFallback: "[kiss]" },
  slap:     { discordName: "ash_slap",     envVar: "EMOJI_ASH_SLAP_ID",     textFallback: "[slap]" },
  punch:    { discordName: "ash_punch",    envVar: "EMOJI_ASH_PUNCH_ID",    textFallback: "[punch]" },
  kick:     { discordName: "ash_kick",     envVar: "EMOJI_ASH_KICK_ID",     textFallback: "[kick]" },
  bonk:     { discordName: "ash_bonk",     envVar: "EMOJI_ASH_BONK_ID",     textFallback: "[bonk]" },
  bite:     { discordName: "ash_bite",     envVar: "EMOJI_ASH_BITE_ID",     textFallback: "[bite]" },
  poke:     { discordName: "ash_poke",     envVar: "EMOJI_ASH_POKE_ID",     textFallback: "[poke]" },
  wave:     { discordName: "ash_wave",     envVar: "EMOJI_ASH_WAVE_ID",     textFallback: "[wave]" },
  highfive: { discordName: "ash_highfive", envVar: "EMOJI_ASH_HIGHFIVE_ID", textFallback: "[highfive]" },
  yeet:     { discordName: "ash_yeet",     envVar: "EMOJI_ASH_YEET_ID",     textFallback: "[yeet]" },
  dance:    { discordName: "ash_dance",    envVar: "EMOJI_ASH_DANCE_ID",    textFallback: "[dance]" },
  throw:    { discordName: "ash_throw",    envVar: "EMOJI_ASH_THROW_ID",    textFallback: "[throw]" },
  hit:      { discordName: "ash_hit",      envVar: "EMOJI_ASH_HIT_ID",      textFallback: "[hit]" },
  smack:    { discordName: "ash_smack",    envVar: "EMOJI_ASH_SMACK_ID",    textFallback: "[smack]" },
  tickle:   { discordName: "ash_tickle",   envVar: "EMOJI_ASH_TICKLE_ID",   textFallback: "[tickle]" },

  // ── System (kept separate, no emoji needed for text fallback) ──
  ai:        { discordName: "ash_ai",        envVar: "EMOJI_ASH_AI_ID",        textFallback: "[ai]" },
  success:   { discordName: "ash_success",   envVar: "EMOJI_ASH_SUCCESS_ID",   textFallback: "[ok]" },
  error:     { discordName: "ash_error",     envVar: "EMOJI_ASH_ERROR_ID",     textFallback: "[err]" },
  warning:   { discordName: "ash_warning",   envVar: "EMOJI_ASH_WARNING_ID",   textFallback: "[!]" },
  info:      { discordName: "ash_info",      envVar: "EMOJI_ASH_INFO_ID",      textFallback: "[i]" },
  loading:   { discordName: "ash_loading",   envVar: "EMOJI_ASH_LOADING_ID",   textFallback: "..." },
  online:    { discordName: "ash_online",    envVar: "EMOJI_ASH_ONLINE_ID",    textFallback: "ON" },
  offline:   { discordName: "ash_offline",   envVar: "EMOJI_ASH_OFFLINE_ID",   textFallback: "OFF" },
  degraded:  { discordName: "ash_degraded",  envVar: "EMOJI_ASH_DEGRADED_ID",  textFallback: "~" },
  settings:  { discordName: "ash_settings",  envVar: "EMOJI_ASH_SETTINGS_ID",  textFallback: "[cfg]" },
  stats:     { discordName: "ash_stats",     envVar: "EMOJI_ASH_STATS_ID",     textFallback: "[#]" },
};

export const ANIME_EMOTE_NAMES = Object.keys(ANIME_EMOTE_MAP) as AnimeEmoteName[];

/* ================================================================
 * RUNTIME STATE
 * ================================================================ */

let _guildId: string | undefined;
let _resolvedIds: Partial<Record<AnimeEmoteName, string>> = {};
let _initialized = false;

function init(): void {
  if (_initialized) return;
  _initialized = true;

  // Read from environment variables
  for (const [name, config] of Object.entries(ANIME_EMOTE_MAP)) {
    const id = process.env[config.envVar]?.trim();
    if (id) {
      _resolvedIds[name as AnimeEmoteName] = id;
    }
  }

  // Try to load from emoji-manifest.json (generated by upload script)
  try {
    const manifestPath = join(process.cwd(), "assets", "emojis", "emoji-manifest.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      if (manifest.guildId && !_guildId) {
        _guildId = manifest.guildId;
      }
      if (manifest.animeEmotes && typeof manifest.animeEmotes === "object") {
        for (const [name, id] of Object.entries(manifest.animeEmotes)) {
          if (typeof id === "string" && !_resolvedIds[name as AnimeEmoteName]) {
            _resolvedIds[name as AnimeEmoteName] = id;
          }
        }
      }
    }
  } catch {
    // Manifest not present or invalid — that's fine
  }
}

/* ================================================================
 * PUBLIC API
 * ================================================================ */

/**
 * Get a Discord custom emote string, or text fallback.
 *
 * NEVER returns Unicode emoji.
 *
 * Usage:
 *   animeEmote("slap") → "<:ash_slap:123456>" or "[slap]"
 *   animeEmote("happy") → "<:ash_happy:123456>" or ":)"
 */
export function animeEmote(name: AnimeEmoteName): string {
  init();
  const config = ANIME_EMOTE_MAP[name];
  if (!config) return `[${name}]`;

  const id = _resolvedIds[name];
  if (id && _guildId) {
    return `<:${config.discordName}:${id}>`;
  }
  return config.textFallback;
}

/**
 * Get just the emoji ID string (without Discord formatting).
 */
export function animeEmoteId(name: AnimeEmoteName): string | undefined {
  init();
  return _resolvedIds[name];
}

/**
 * Get the guild ID where custom anime emotes are uploaded.
 */
export function animeEmoteGuildId(): string | undefined {
  init();
  return _guildId;
}

/**
 * Check if custom emoji is configured for a given name.
 */
export function hasAnimeEmote(name: AnimeEmoteName): boolean {
  init();
  return !!_resolvedIds[name] && !!_guildId;
}

/**
 * Get the text fallback for a given emote name.
 */
export function animeTextFallback(name: AnimeEmoteName): string {
  return ANIME_EMOTE_MAP[name]?.textFallback ?? `[${name}]`;
}

/**
 * Get all configured emote names and their IDs.
 */
export function configuredAnimeEmotes(): Partial<Record<AnimeEmoteName, string>> {
  init();
  return { ..._resolvedIds };
}

/**
 * Validate that an emote name is valid.
 */
export function isValidAnimeEmote(name: string): name is AnimeEmoteName {
  return name in ANIME_EMOTE_MAP;
}

/**
 * Get all available emote names.
 */
export function allAnimeEmoteNames(): AnimeEmoteName[] {
  return [...ANIME_EMOTE_NAMES];
}

/**
 * Get emote names by category prefix.
 */
export function getAnimeEmotesByPrefix(prefix: "reaction" | "action" | "system"): AnimeEmoteName[] {
  const results: AnimeEmoteName[] = [];
  for (const [name, _config] of Object.entries(ANIME_EMOTE_MAP)) {
    const emoteName = name as AnimeEmoteName;
    if (prefix === "reaction" && isReactionName(emoteName)) results.push(emoteName);
    else if (prefix === "action" && isActionName(emoteName)) results.push(emoteName);
    else if (prefix === "system" && isSystemName(emoteName)) results.push(emoteName);
  }
  return results;
}

function isReactionName(name: string): name is AnimeReactionName {
  return ["happy","laugh","smug","angry","cry","blush","shock","panic","confused","sleepy","love","embarrassed","sad","excited","determined"].includes(name);
}

function isActionName(name: string): name is AnimeActionName {
  return ["hug","cuddle","pat","headpat","kiss","slap","punch","kick","bonk","bite","poke","wave","highfive","yeet","dance","cry","blush","throw","hit","smack","tickle"].includes(name);
}

function isSystemName(name: string): name is AnimeSystemName {
  return ["ai","success","error","warning","info","loading","online","offline","degraded","settings","stats"].includes(name);
}
