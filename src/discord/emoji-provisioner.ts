/* ================================================================
 * EMOJI PROVISIONER — Automatic Custom Emoji Discovery & Upload
 *
 * At bot startup, automatically:
 *   1. Fetches the guild's existing custom emojis
 *   2. Matches them by name against expected emoji list
 *   3. Uploads missing emojis from assets/emojis/png/
 *   4. Stores resolved IDs in memory (never writes to .env)
 *
 * Graceful fallback: if provisioning fails or custom emojis are
 * unavailable, the bot continues running with text/Unicode fallbacks.
 *
 * Idempotent: restarting the bot never creates duplicates.
 * ================================================================ */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Guild } from "discord.js";
import { ICON_MAP, ICON_NAMES, LOGICAL_TO_LEGACY, type IconName } from "./icons";
import { ANIME_EMOTE_MAP, ANIME_EMOTE_NAMES, type AnimeEmoteName } from "./anime-emotes";

function getLogger() {
  const { logger } = require("../logger");
  return logger;
}

/* ================================================================
 * TYPES
 * ================================================================ */

export interface ProvisionResult {
  /** Logical icon name -> Discord emoji ID */
  icons: Partial<Record<IconName, string>>;
  /** Anime emote name -> Discord emoji ID */
  animeEmotes: Partial<Record<AnimeEmoteName, string>>;
  /** Guild ID used for provisioning */
  guildId: string;
  /** Number of emojis uploaded during this run */
  uploaded: number;
  /** Number of emojis found already existing */
  existing: number;
  /** Whether provisioning encountered any errors (non-fatal) */
  hadErrors: boolean;
}

/* ================================================================
 * INTERNAL STATE
 * ================================================================ */

let _resolved: ProvisionResult | null = null;

const PNG_DIR = join(process.cwd(), "assets", "emojis", "png");

/* ================================================================
 * CORE PROVISIONING
 * ================================================================ */

/**
 * Provision all expected emojis for the given guild.
 * - Idempotent: existing emojis are reused, never duplicated.
 * - Never writes to .env or any secrets file.
 * - Graceful: returns partial results on failure, never throws.
 */
export async function provisionEmojis(guild: Guild): Promise<ProvisionResult> {
  if (_resolved) return _resolved;

  const result: ProvisionResult = {
    icons: {},
    animeEmotes: {},
    guildId: guild.id,
    uploaded: 0,
    existing: 0,
    hadErrors: false,
  };

  try {
    // 1. Fetch existing guild emojis
    const existingEmojis = await guild.emojis.fetch();
    getLogger().info(`Emoji provisioner: found ${existingEmojis.size} existing emojis in guild ${guild.name}`);

    // Build a name -> ID lookup (use legacy "ash_*" names for matching)
    const existingByName = new Map<string, string>();
    for (const [, emoji] of existingEmojis) {
      existingByName.set(emoji.name, emoji.id);
    }

    // 2. Provision Tabler utility icons
    for (const name of ICON_NAMES) {
      const config = ICON_MAP[name];
      const legacyName = LOGICAL_TO_LEGACY[name];

      // Try to find by legacy name first (ash_*), then logical name
      const foundId = existingByName.get(legacyName)
        ?? existingByName.get(name);

      if (foundId) {
        result.icons[name] = foundId;
        result.existing++;
        continue;
      }

      // Try to upload
      const pngPath = join(PNG_DIR, `${legacyName}.png`);
      if (existsSync(pngPath)) {
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

    // 3. Provision anime emotes (same pattern)
    for (const name of ANIME_EMOTE_NAMES) {
      const config = ANIME_EMOTE_MAP[name];
      const foundId = existingByName.get(config.discordName);

      if (foundId) {
        result.animeEmotes[name] = foundId;
        result.existing++;
        continue;
      }

      // Try to upload (anime emotes use the same ash_* naming convention)
      const pngPath = join(PNG_DIR, `${config.discordName}.png`);
      if (existsSync(pngPath)) {
        const uploaded = await uploadEmojiToGuild(guild, config.discordName, pngPath);
        if (uploaded) {
          result.animeEmotes[name] = uploaded;
          result.uploaded++;
        } else {
          result.hadErrors = true;
        }
      }
      // Anime emotes that don't have PNGs simply get no ID — text fallback is used
    }

    getLogger().info(
      `Emoji provisioner: ${result.existing} existing, ${result.uploaded} uploaded, ` +
      `${result.hadErrors ? "some errors" : "no errors"}`
    );
  } catch (error) {
    getLogger().warn(`Emoji provisioner failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
    result.hadErrors = true;
  }

  _resolved = result;
  return result;
}

/**
 * Get the resolved provision result (or null if not yet run).
 */
export function getProvisionResult(): ProvisionResult | null {
  return _resolved;
}

/**
 * Get the icon ID for a logical icon name.
 */
export function getIconId(name: IconName): string | undefined {
  return _resolved?.icons[name];
}

/**
 * Get the anime emote ID for an anime emote name.
 */
export function getAnimeEmoteId(name: AnimeEmoteName): string | undefined {
  return _resolved?.animeEmotes[name];
}

/**
 * Get the guild ID used for provisioning.
 */
export function getProvisionedGuildId(): string | undefined {
  return _resolved?.guildId;
}

/**
 * Reset provisioning state (for testing).
 */
export function resetProvisioner(): void {
  _resolved = null;
}

/* ================================================================
 * UPLOAD HELPER
 * ================================================================ */

async function uploadEmojiToGuild(
  guild: Guild,
  name: string,
  imagePath: string,
): Promise<string | null> {
  try {
    const pngBuffer = readFileSync(imagePath);
    const formData = new FormData();
    formData.append("file", new Blob([pngBuffer], { type: "image/png" }), `${name}.png`);
    formData.append("name", name);

    const response = await guild.emojis.create({
      attachment: imagePath,
      name: name,
    });

    getLogger().info(`Emoji provisioner: uploaded ${name} → ID: ${response.id}`);
    return response.id;
  } catch (error) {
    getLogger().warn(`Emoji provisioner: failed to upload ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/* ================================================================
 * ENV VAR LEGACY SUPPORT
 *
 * For backward compatibility, still read EMOJI_ASH_*_ID from env
 * if set. The automatic provisioning is preferred but env vars
 * can serve as overrides.
 * ================================================================ */

/**
 * Load legacy env var overrides into the provision result.
 * Called after provisionEmojis to fill in any env var overrides.
 */
export function applyEnvOverrides(result: ProvisionResult): void {
  // Icon env var overrides
  for (const name of ICON_NAMES) {
    const config = ICON_MAP[name];
    const envId = process.env[config.envVar]?.trim();
    if (envId) {
      result.icons[name] = envId;
    }
  }

  // Anime emote env var overrides
  for (const name of ANIME_EMOTE_NAMES) {
    const config = ANIME_EMOTE_MAP[name];
    const envId = process.env[config.envVar]?.trim();
    if (envId) {
      result.animeEmotes[name] = envId;
    }
  }
}
