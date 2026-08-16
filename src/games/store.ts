import fs from "fs";
import path from "path";
import { GamePlayer } from "./types";
import { withGlobalLock, withPlayerLock } from "./lock";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "game-players.json");

async function ensureStore(): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.promises.access(FILE);
  } catch {
    await fs.promises.writeFile(FILE, "{}", "utf8");
  }
}

async function loadPlayersUnlocked(): Promise<Record<string, GamePlayer>> {
  await ensureStore();

  try {
    const raw = await fs.promises.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object"
      ? parsed as Record<string, GamePlayer>
      : {};
  } catch {
    return {};
  }
}

async function savePlayersUnlocked(
  players: Record<string, GamePlayer>,
): Promise<void> {
  await ensureStore();

  /*
   * Unique temporary file per write.
   *
   * The old implementation used:
   *
   *   game-players.json.tmp
   *
   * Concurrent writes could overwrite/remove that file before another
   * operation reached rename(), producing ENOENT.
   */
  const temporary = `${FILE}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`;

  try {
    await fs.promises.writeFile(
      temporary,
      JSON.stringify(players, null, 2),
      "utf8",
    );

    await fs.promises.rename(temporary, FILE);
  } finally {
    try {
      await fs.promises.unlink(temporary);
    } catch {
      // Temporary file may already have been renamed successfully.
    }
  }
}

export async function loadPlayers(): Promise<Record<string, GamePlayer>> {
  return withGlobalLock("game-players-store", async () => {
    return loadPlayersUnlocked();
  });
}

export async function savePlayers(
  players: Record<string, GamePlayer>,
): Promise<void> {
  return withGlobalLock("game-players-store", async () => {
    await savePlayersUnlocked(players);
  });
}

function normalizePlayer(
  player: Partial<GamePlayer>,
  userId: string,
  username: string,
): GamePlayer {
  return {
    userId,
    username,

    coins: player.coins ?? 100,
    xp: player.xp ?? 0,
    level: player.level ?? 1,
    totalXpEarned: player.totalXpEarned ?? 0,

    wins: player.wins ?? 0,
    losses: player.losses ?? 0,
    draws: player.draws ?? 0,

    streak: player.streak ?? 0,
    bestStreak: player.bestStreak ?? 0,
    gamesPlayed: player.gamesPlayed ?? 0,

    dailyClaimedAt: player.dailyClaimedAt,
    dailyStreak: player.dailyStreak ?? 0,
    bestDailyStreak: player.bestDailyStreak ?? 0,

    achievements: player.achievements ?? [],

    classId: player.classId,
    regionId: player.regionId,

    hp: player.hp ?? 100,
    maxHp: player.maxHp ?? 100,
    attack: player.attack ?? 15,
    defense: player.defense ?? 5,

    duelWins: player.duelWins ?? 0,
    duelLosses: player.duelLosses ?? 0,

    luck: player.luck ?? 0,
    deaths: player.deaths ?? 0,

    reputation: player.reputation ?? 0,
    titles: player.titles ?? [],

    huntLastAt: player.huntLastAt,
    huntStreak: player.huntStreak ?? 0,
    bestHuntStreak: player.bestHuntStreak ?? 0,
    huntsCompleted: player.huntsCompleted ?? 0,
    legendaryHunts: player.legendaryHunts ?? 0,
    epicHunts: player.epicHunts ?? 0,

    inventory: player.inventory ?? {},
    equipment: player.equipment ?? [],

    xpBoostActive: player.xpBoostActive ?? false,
    luckyTokenActive: player.luckyTokenActive ?? false,

    casinoWagered: player.casinoWagered ?? 0,
    casinoWon: player.casinoWon ?? 0,
    casinoLost: player.casinoLost ?? 0,
    casinoWins: player.casinoWins ?? 0,
    casinoLosses: player.casinoLosses ?? 0,
  };
}

export async function getPlayer(
  userId: string,
  username = "Unknown",
): Promise<GamePlayer> {
  return withPlayerLock(userId, async () => {
    const players = await loadPlayers();

    if (!players[userId]) {
      players[userId] = normalizePlayer({}, userId, username);
      await savePlayers(players);
    } else {
      players[userId] = normalizePlayer(
        players[userId],
        userId,
        username,
      );
    }

    return players[userId];
  });
}

export async function updatePlayer(
  player: GamePlayer,
): Promise<void> {
  return withPlayerLock(player.userId, async () => {
    const players = await loadPlayers();

    players[player.userId] = normalizePlayer(
      player,
      player.userId,
      player.username,
    );

    await savePlayers(players);
  });
}

export async function mutatePlayer<T>(
  userId: string,
  mutator: (player: GamePlayer) => T | Promise<T>,
  username = "Unknown",
): Promise<{
  player: GamePlayer;
  result: T;
}> {
  /*
   * game-players.json is one shared file.
   *
   * The complete read -> mutate -> write operation must therefore
   * use the global store lock. A per-player lock is not sufficient
   * because different players still rewrite the same JSON file.
   */
  return withGlobalLock("game-players-store", async () => {
    const players = await loadPlayersUnlocked();

    let player = players[userId];

    if (!player) {
      player = normalizePlayer({}, userId, username);
    } else {
      player = normalizePlayer(player, userId, username);
    }

    const result = await mutator(player);

    players[userId] = normalizePlayer(
      player,
      userId,
      player.username,
    );

    await savePlayersUnlocked(players);

    return {
      player: players[userId],
      result,
    };
  });
}

export async function getLeaderboard(
  limit = 10,
  sortBy: "level" | "xp" | "coins" = "level",
): Promise<GamePlayer[]> {
  const players = await loadPlayers();

  return Object.values(players)
    .map((player) =>
      normalizePlayer(player, player.userId, player.username),
    )
    .sort((a, b) => {
      if (sortBy === "xp") {
        if (b.xp !== a.xp) {
          return b.xp - a.xp;
        }

        if (b.level !== a.level) {
          return b.level - a.level;
        }

        return b.coins - a.coins;
      }

      if (sortBy === "coins") {
        if (b.coins !== a.coins) {
          return b.coins - a.coins;
        }

        if (b.level !== a.level) {
          return b.level - a.level;
        }

        return b.xp - a.xp;
      }

      if (b.level !== a.level) {
        return b.level - a.level;
      }

      if (b.xp !== a.xp) {
        return b.xp - a.xp;
      }

      return b.coins - a.coins;
    })
    .slice(0, limit);
}
