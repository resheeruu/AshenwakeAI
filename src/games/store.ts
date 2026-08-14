import fs from "fs";
import path from "path";
import { GamePlayer } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "game-players.json");

async function ensureStore(): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  if (!fs.existsSync(FILE)) {
    await fs.promises.writeFile(FILE, "{}", "utf8");
  }
}

export async function loadPlayers(): Promise<Record<string, GamePlayer>> {
  await ensureStore();

  try {
    const raw = await fs.promises.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export async function savePlayers(
  players: Record<string, GamePlayer>,
): Promise<void> {
  await ensureStore();

  const temporary = `${FILE}.tmp`;

  await fs.promises.writeFile(
    temporary,
    JSON.stringify(players, null, 2),
    "utf8",
  );

  await fs.promises.rename(temporary, FILE);
}

export async function getPlayer(
  userId: string,
  username = "Unknown",
): Promise<GamePlayer> {
  const players = await loadPlayers();

  if (!players[userId]) {
    players[userId] = {
      userId,
      username,
      coins: 100,
      xp: 0,
      level: 1,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      bestStreak: 0,
      gamesPlayed: 0,
      achievements: [],

      // Ashen Duel starting stats
      hp: 100,
      maxHp: 100,
      attack: 15,
      defense: 5,
      duelWins: 0,
      duelLosses: 0,

      // Inventory
      inventory: {},
    };

    await savePlayers(players);
  } else {
    players[userId].username = username;
  }

  return players[userId];
}

export async function updatePlayer(
  player: GamePlayer,
): Promise<void> {
  const players = await loadPlayers();
  players[player.userId] = player;
  await savePlayers(players);
}

export async function getLeaderboard(
  limit = 10,
): Promise<GamePlayer[]> {
  const players = await loadPlayers();

  return Object.values(players)
    .sort((a, b) => {
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
