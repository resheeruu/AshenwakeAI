import { GamePlayer } from "../types";
import { mutatePlayer } from "../store";
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
  const game = sessions.get(playerId);
  if (game && !game.finished) {
    const now = Date.now();
    if ((now - game.startedAt) > SESSION_MAX_AGE_MS) {
      sessions.delete(playerId);
      return undefined;
    }
  }
  return game;
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
  userId: string,
  username: string,
  game: QuickDrawGame,
): Promise<QuickDrawResult> {
  if (game.finished) {
    throw new Error("QUICKDRAW_FINISHED");
  }

  /*
   * Claim the game SYNCHRONOUSLY before the first await. The win path
   * used to set `finished` only after `await mutatePlayer`, so a second
   * ⚡ click during the settle window passed the guard above and was
   * credited again (double-credit). Reset on failure so a transient
   * store error does not strand a settled-in-name-only game.
   */
  game.finished = true;

  try {
    const now = Date.now();

    if (now < game.drawAt) {
      sessions.delete(userId);

      const { result } = await mutatePlayer(userId, async (p: GamePlayer) => {
        p.gamesPlayed++;
        p.losses++;
        p.streak = 0;
        p.coins = Math.max(
          0,
          p.coins - 10,
        );
        p.xp += 5;

        const levelUp = applyLevelUp(p);

        updateAchievements(p);

        return {
          won: false,
          reactionTime: 0,
          coins: -10,
          xp: 5,
          levelUp,
        };
      }, username);

      return result;
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
    }

    const { result } = await mutatePlayer(userId, async (p: GamePlayer) => {
      if (won) {
        p.wins++;
        p.streak++;

        p.bestStreak = Math.max(
          p.bestStreak,
          p.streak,
        );
      } else {
        p.losses++;
        p.streak = 0;
      }

      p.gamesPlayed++;
      p.coins += coins;
      p.xp += xp;

      const levelUp = applyLevelUp(p);

      updateAchievements(p);

      return { won, reactionTime, coins, xp, levelUp };
    }, username);

    sessions.delete(userId);

    return result;
  } catch (error) {
    game.finished = false;
    throw error;
  }
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