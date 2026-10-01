import { GamePlayer } from "../types";
import { mutatePlayer } from "../store";
import {
  applyLevelUp,
  updateAchievements,
} from "../rewards";

export type MinesGame = {
  playerId: string;
  bet: number;
  mines: Set<number>;
  revealed: Set<number>;
  multiplier: number;
  finished: boolean;
  startedAt: number;
};

export type MinesRevealResult = {
  tile: number;
  mine: boolean;
  multiplier: number;
  payout: number;
  finished: boolean;
  levelUp: boolean;
};

const GRID_SIZE = 16;
const MINE_COUNT = 3;
const MIN_BET = 10;
const MAX_BET = 1000;

const sessions = new Map<string, MinesGame>();

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

function createMines(): Set<number> {
  const mines = new Set<number>();

  while (mines.size < MINE_COUNT) {
    mines.add(
      Math.floor(Math.random() * GRID_SIZE),
    );
  }

  return mines;
}

export function getMinesGame(
  playerId: string,
): MinesGame | undefined {
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

export async function startMines(
  userId: string,
  username: string,
  bet: number,
): Promise<MinesGame> {
  if (sessions.has(userId)) {
    throw new Error("MINES_ALREADY_ACTIVE");
  }

  if (
    !Number.isInteger(bet) ||
    bet < MIN_BET ||
    bet > MAX_BET
  ) {
    throw new Error("INVALID_MINES_BET");
  }

  const { player } = await mutatePlayer(userId, async (p: GamePlayer) => {
    /*
     * Re-check under the store lock: the fast check above runs before the
     * first await, so two near-simultaneous starts could both pass it and
     * both debit. The session is created inside this mutator, so checking
     * here closes the race without a second debit.
     */
    if (sessions.has(userId)) {
      throw new Error("MINES_ALREADY_ACTIVE");
    }

    if (p.coins < bet) {
      throw new Error("NOT_ENOUGH_COINS");
    }

    p.coins -= bet;

    const game: MinesGame = {
      playerId: userId,
      bet,
      mines: createMines(),
      revealed: new Set(),
      multiplier: 1,
      finished: false,
      startedAt: Date.now(),
    };

    sessions.set(userId, game);
    return { player: p };
  }, username);

  return sessions.get(userId)!;
}

export async function revealMinesTile(
  userId: string,
  username: string,
  game: MinesGame,
  tile: number,
): Promise<MinesRevealResult> {
  if (game.finished) {
    throw new Error("MINES_FINISHED");
  }

  if (
    !Number.isInteger(tile) ||
    tile < 0 ||
    tile >= GRID_SIZE
  ) {
    throw new Error("INVALID_MINES_TILE");
  }

  if (game.revealed.has(tile)) {
    throw new Error("MINES_TILE_ALREADY_REVEALED");
  }

  game.revealed.add(tile);

  if (game.mines.has(tile)) {
    game.finished = true;
    game.multiplier = 0;

    const { result } = await mutatePlayer(userId, async (p: GamePlayer) => {
      p.gamesPlayed++;
      p.losses++;
      p.streak = 0;
      p.xp += 5;

      applyLevelUp(p);
      updateAchievements(p);

      return { payout: 0, levelUp: false };
    }, username);

    sessions.delete(userId);

    return {
      tile,
      mine: true,
      multiplier: 0,
      payout: 0,
      finished: true,
      levelUp: false,
    };
  }

  game.multiplier =
    1 + game.revealed.size * 0.25;

  return {
    tile,
    mine: false,
    multiplier: game.multiplier,
    payout: Math.floor(
      game.bet * game.multiplier,
    ),
    finished: false,
    levelUp: false,
  };
}

export async function cashOutMines(
  userId: string,
  username: string,
  game: MinesGame,
): Promise<{
  payout: number;
  xp: number;
  levelUp: boolean;
}> {
  if (game.finished) {
    throw new Error("MINES_FINISHED");
  }

  if (game.revealed.size === 0) {
    throw new Error("MINES_NO_REVEALS");
  }

  const payout = Math.floor(
    game.bet * game.multiplier,
  );

  const xp = Math.max(
    10,
    Math.floor(game.multiplier * 20),
  );

  game.finished = true;

  const { result } = await mutatePlayer(userId, async (p: GamePlayer) => {
    p.coins += payout;
    p.xp += xp;
    p.gamesPlayed++;
    p.wins++;
    p.streak++;

    p.bestStreak = Math.max(
      p.bestStreak,
      p.streak,
    );

    const levelUp = applyLevelUp(p);

    updateAchievements(p);

    return { payout, xp, levelUp };
  }, username);

  sessions.delete(userId);

  return result;
}

export function cancelMines(
  playerId: string,
): void {
  sessions.delete(playerId);
}

export const MINES_GRID_SIZE = GRID_SIZE;
export const MINES_COUNT = MINE_COUNT;
export const MINES_MIN_BET = MIN_BET;
export const MINES_MAX_BET = MAX_BET;