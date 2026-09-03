import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import {
  applyLevelUp,
  updateAchievements,
} from "../rewards";

export type QuickDrawGame = {
  playerId: string;
  startedAt: number;
  drawAt: number;
  finished: boolean;
};

export type QuickDrawResult = {
  won: boolean;
  reactionTime: number;
  coins: number;
  xp: number;
  levelUp: boolean;
};

const MIN_REACTION_MS = 100;
const MAX_REACTION_MS = 3000;

const sessions = new Map<string, QuickDrawGame>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_MAX_AGE_MS = 10 * 60 * 1000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, game] of sessions) {
    if (game.finished || (now - game.startedAt) > SESSION_MAX_AGE_MS) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

export function getQuickDraw(
  playerId: string,
): QuickDrawGame | undefined {
  return sessions.get(playerId);
}

export function startQuickDraw(
  playerId: string,
): QuickDrawGame {
  if (sessions.has(playerId)) {
    throw new Error("QUICKDRAW_ALREADY_ACTIVE");
  }

  const startedAt = Date.now();

  const drawDelay =
    1500 + Math.floor(Math.random() * 3500);

  const game: QuickDrawGame = {
    playerId,
    startedAt,
    drawAt: startedAt + drawDelay,
    finished: false,
  };

  sessions.set(playerId, game);

  return game;
}

export async function reactQuickDraw(
  player: GamePlayer,
  game: QuickDrawGame,
): Promise<QuickDrawResult> {
  if (game.finished) {
    throw new Error("QUICKDRAW_FINISHED");
  }

  const now = Date.now();

  if (now < game.drawAt) {
    game.finished = true;
    sessions.delete(player.userId);

    player.gamesPlayed++;
    player.losses++;
    player.streak = 0;
    player.coins = Math.max(
      0,
      player.coins - 10,
    );
    player.xp += 5;

    const levelUp = applyLevelUp(player);

    updateAchievements(player);
    await updatePlayer(player);

    return {
      won: false,
      reactionTime: 0,
      coins: -10,
      xp: 5,
      levelUp,
    };
  }

  const reactionTime =
    now - game.drawAt;

  const won =
    reactionTime >= MIN_REACTION_MS &&
    reactionTime <= MAX_REACTION_MS;

  let coins = 0;
  let xp = 5;

  if (won) {
    const speedBonus =
      Math.max(
        0,
        100 - Math.floor(reactionTime / 10),
      );

    coins = 25 + speedBonus;
    xp = 25;

    player.wins++;
    player.streak++;

    player.bestStreak = Math.max(
      player.bestStreak,
      player.streak,
    );
  } else {
    player.losses++;
    player.streak = 0;
  }

  player.gamesPlayed++;
  player.coins += coins;
  player.xp += xp;

  game.finished = true;
  sessions.delete(player.userId);

  const levelUp = applyLevelUp(player);

  updateAchievements(player);

  await updatePlayer(player);

  return {
    won,
    reactionTime,
    coins,
    xp,
    levelUp,
  };
}

export function cancelQuickDraw(
  playerId: string,
): void {
  sessions.delete(playerId);
}

export const QUICKDRAW_MIN_REACTION =
  MIN_REACTION_MS;

export const QUICKDRAW_MAX_REACTION =
  MAX_REACTION_MS;
