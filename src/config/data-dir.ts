/* ================================================================
 * ASHENAI DATA DIRECTORY RESOLVER
 *
 * Single authoritative source for the runtime data directory.
 * Defaults to process.cwd()/data when ASHENAI_DATA_DIR is not set.
 * All runtime data must resolve beneath this directory.
 * ================================================================ */

import path from "node:path";

/**
 * Get the root runtime data directory.
 *
 * When ASHENAI_DATA_DIR is set, all runtime data must resolve beneath it.
 * When unset, defaults to process.cwd()/data (production behavior).
 *
 * ASHENAI_DATA_DIR represents the ROOT data directory.
 * Example:
 *   ASHENAI_DATA_DIR=/tmp/ashen-test-123
 *   → database: /tmp/ashen-test-123/ashenai.db
 *   → game players: /tmp/ashen-test-123/game-players.json
 *   → guild config: /tmp/ashen-test-123/guild-config.json
 *   → NOT /tmp/ashen-test-123/data/...
 */
export function getDataDir(): string {
  return process.env.ASHENAI_DATA_DIR ?? path.join(process.cwd(), "data");
}

/**
 * Get a file path within the runtime data directory.
 * Joins the given path segments to the data directory root.
 */
export function getDataPath(...segments: string[]): string {
  return path.join(getDataDir(), ...segments);
}

/**
 * Get the path for the main SQLite database.
 * In production: <cwd>/data/ashenai.db
 * In tests: <ASHENAI_DATA_DIR>/ashenai.db
 */
export function getDatabasePath(): string {
  return getDataPath("ashenai.db");
}

/**
 * Get the path for the game players JSON store.
 */
export function getGamePlayersPath(): string {
  return getDataPath("game-players.json");
}

/**
 * Get the path for guild configuration files.
 */
export function getGuildConfigPath(): string {
  return getDataPath("guild-config.json");
}

/**
 * Get the path for user profiles JSON store.
 */
export function getUserProfilesPath(): string {
  return getDataPath("user-profiles.json");
}

/**
 * Get the path for the audit log JSON store.
 */
export function getAuditPath(): string {
  return getDataPath("audit.json");
}

/**
 * Get the path for the policy engine JSON store.
 */
export function getPolicyPath(): string {
  return getDataPath("policy.json");
}

/**
 * Get the path for warnings JSON store.
 */
export function getWarningsPath(): string {
  return getDataPath("warnings.json");
}

/**
 * Get the path for the SQLite tasks database.
 */
export function getTasksPath(): string {
  return getDataPath("agent-tasks.db");
}

/**
 * Get the path for world boss data JSON store.
 */
export function getWorldBossPath(): string {
  return getDataPath("world-bosses.json");
}

/**
 * Get the path for dungeon data JSON store.
 */
export function getDungeonPath(): string {
  return getDataPath("dungeons.json");
}

/**
 * Get the path for seasons data JSON store.
 */
export function getSeasonsPath(): string {
  return getDataPath("seasons.json");
}

/**
 * Get the path for the current season JSON file.
 */
export function getCurrentSeasonPath(): string {
  return getDataPath("current-season.json");
}

/**
 * Get the path for the accounts JSON file.
 */
export function getAccountsPath(): string {
  return getDataPath("accounts.json");
}

/**
 * Get the backups directory.
 */
export function getBackupsDir(): string {
  return getDataPath("backups");
}

/**
 * Get the anime GIFs directory.
 */
export function getAnimeGifsDir(): string {
  return getDataPath("anime-gifs");
}

/**
 * Ensure the data directory and common subdirectories exist.
 */
export function ensureDataDir(): void {
  const { mkdirSync } = require("node:fs");
  const dir = getDataDir();
  mkdirSync(dir, { recursive: true });
  mkdirSync(getBackupsDir(), { recursive: true });
  mkdirSync(getAnimeGifsDir(), { recursive: true });
}