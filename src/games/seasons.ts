import fs from "fs";
import path from "path";
import { GamePlayer } from "./types";
import { GAME_CONFIG } from "./config";
import { loadPlayers } from "./store";

export type SeasonConfig = {
  id: string;
  name: string;
  theme: string;
  emoji: string;
  startDate: number;
  endDate: number;
  active: boolean;
};

export type SeasonStats = {
  highestLevel: number;
  richestPlayer: string;
  richestCoins: number;
  mostBossKills: string;
  bossKills: number;
  highestDamage: string;
  damage: number;
  mostAchievements: string;
  achievementCount: number;
  guildRankings: string[];
};

export type ArchivedSeason = {
  config: SeasonConfig;
  stats: SeasonStats;
  playerSnapshots: Record<string, {
    level: number;
    coins: number;
    bossKills: number;
    achievements: number;
    rank: number;
  }>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const SEASONS_FILE = path.join(DATA_DIR, "seasons.json");
const CURRENT_SEASON_FILE = path.join(DATA_DIR, "current-season.json");

async function ensureSeasonStore(): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  if (!fs.existsSync(SEASONS_FILE)) {
    await fs.promises.writeFile(SEASONS_FILE, "[]", "utf8");
  }

  if (!fs.existsSync(CURRENT_SEASON_FILE)) {
    await fs.promises.writeFile(CURRENT_SEASON_FILE, "null", "utf8");
  }
}

export async function getCurrentSeason(): Promise<SeasonConfig | null> {
  await ensureSeasonStore();

  try {
    const raw = await fs.promises.readFile(CURRENT_SEASON_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") return null;

    if (Date.now() > parsed.endDate) {
      return null;
    }

    return parsed as SeasonConfig;
  } catch {
    return null;
  }
}

export async function startNewSeason(
  name: string,
  theme: string,
  emoji: string,
): Promise<SeasonConfig> {
  await ensureSeasonStore();

  const current = await getCurrentSeason();
  if (current && current.active) {
    await endCurrentSeason();
  }

  const durationDays = GAME_CONFIG.seasons.durationDays;
  const now = Date.now();

  const season: SeasonConfig = {
    id: `season_${now}`,
    name,
    theme,
    emoji,
    startDate: now,
    endDate: now + durationDays * 24 * 60 * 60 * 1000,
    active: true,
  };

  await fs.promises.writeFile(
    CURRENT_SEASON_FILE,
    JSON.stringify(season, null, 2),
    "utf8",
  );

  return season;
}

export async function endCurrentSeason(): Promise<ArchivedSeason | null> {
  await ensureSeasonStore();

  const current = await getCurrentSeason();
  if (!current) return null;

  const stats = await calculateSeasonStats(current);

  const snapshots = await buildPlayerSnapshots();

  const archived: ArchivedSeason = {
    config: { ...current, active: false },
    stats,
    playerSnapshots: snapshots,
  };

  const raw = await fs.promises.readFile(SEASONS_FILE, "utf8");
  const seasons: ArchivedSeason[] = JSON.parse(raw);
  seasons.push(archived);

  await fs.promises.writeFile(
    SEASONS_FILE,
    JSON.stringify(seasons, null, 2),
    "utf8",
  );

  await fs.promises.writeFile(CURRENT_SEASON_FILE, "null", "utf8");

  return archived;
}

async function calculateSeasonStats(season: SeasonConfig): Promise<SeasonStats> {
  const players = await loadPlayers();
  const playerList = Object.values(players);

  let highestLevel = 0;
  let richestPlayer = "";
  let richestCoins = 0;
  let mostBossKills = "";
  let bossKills = 0;
  let highestDamage = "";
  let damage = 0;
  let mostAchievements = "";
  let achievementCount = 0;

  for (const player of playerList) {
    if (player.level > highestLevel) {
      highestLevel = player.level;
    }

    if (player.coins > richestCoins) {
      richestCoins = player.coins;
      richestPlayer = player.username;
    }

    const stats = player.statistics;
    if (stats) {
      if (stats.worldBossesKilled > bossKills) {
        bossKills = stats.worldBossesKilled;
        mostBossKills = player.username;
      }

      if (stats.highestDamage > damage) {
        damage = stats.highestDamage;
        highestDamage = player.username;
      }
    }

    if (player.achievements.length > achievementCount) {
      achievementCount = player.achievements.length;
      mostAchievements = player.username;
    }
  }

  return {
    highestLevel,
    richestPlayer,
    richestCoins,
    mostBossKills,
    bossKills,
    highestDamage,
    damage,
    mostAchievements,
    achievementCount,
    guildRankings: [],
  };
}

async function buildPlayerSnapshots(): Promise<Record<string, {
  level: number;
  coins: number;
  bossKills: number;
  achievements: number;
  rank: number;
}>> {
  const players = await loadPlayers();
  const playerList = Object.values(players);

  const sorted = [...playerList].sort((a, b) => b.level - a.level || b.xp - a.xp);

  const snapshots: Record<string, {
    level: number;
    coins: number;
    bossKills: number;
    achievements: number;
    rank: number;
  }> = {};

  sorted.forEach((player, index) => {
    snapshots[player.userId] = {
      level: player.level,
      coins: player.coins,
      bossKills: player.statistics?.worldBossesKilled ?? 0,
      achievements: player.achievements.length,
      rank: index + 1,
    };
  });

  return snapshots;
}

export async function getArchivedSeasons(): Promise<ArchivedSeason[]> {
  await ensureSeasonStore();

  try {
    const raw = await fs.promises.readFile(SEASONS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function getSeasonLeaderboard(
  type: "level" | "coins" | "achievements" | "bossKills",
  limit = 10,
): Promise<Array<{ rank: number; name: string; value: number }>> {
  const players = await loadPlayers();
  const playerList = Object.values(players);

  let sorted: Array<{ name: string; value: number }>;

  switch (type) {
    case "level":
      sorted = playerList
        .map((p) => ({ name: p.username, value: p.level }))
        .sort((a, b) => b.value - a.value);
      break;
    case "coins":
      sorted = playerList
        .map((p) => ({ name: p.username, value: p.coins }))
        .sort((a, b) => b.value - a.value);
      break;
    case "achievements":
      sorted = playerList
        .map((p) => ({ name: p.username, value: p.achievements.length }))
        .sort((a, b) => b.value - a.value);
      break;
    case "bossKills":
      sorted = playerList
        .map((p) => ({
          name: p.username,
          value: p.statistics?.worldBossesKilled ?? 0,
        }))
        .sort((a, b) => b.value - a.value);
      break;
    default:
      sorted = [];
  }

  return sorted.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    ...entry,
  }));
}
