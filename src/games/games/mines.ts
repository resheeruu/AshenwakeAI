import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
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
  return sessions.get(playerId);
}

export async function startMines(
  player: GamePlayer,
  bet: number,
): Promise<MinesGame> {
  if (sessions.has(player.userId)) {
    throw new Error("MINES_ALREADY_ACTIVE");
  }

  if (
    !Number.isInteger(bet) ||
    bet < MIN_BET ||
    bet > MAX_BET
  ) {
    throw new Error("INVALID_MINES_BET");
  }

  if (player.coins < bet) {
    throw new Error("NOT_ENOUGH_COINS");
  }

  player.coins -= bet;

  const game: MinesGame = {
    playerId: player.userId,
    bet,
    mines: createMines(),
    revealed: new Set(),
    multiplier: 1,
    finished: false,
  };

  sessions.set(player.userId, game);

  await updatePlayer(player);

  return game;
}

export async function revealMinesTile(
  player: GamePlayer,
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

    player.gamesPlayed++;
    player.losses++;
    player.streak = 0;
    player.xp += 5;

    applyLevelUp(player);
    updateAchievements(player);

    await updatePlayer(player);

    sessions.delete(player.userId);

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
  player: GamePlayer,
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

  player.coins += payout;
  player.xp += xp;
  player.gamesPlayed++;
  player.wins++;
  player.streak++;

  player.bestStreak = Math.max(
    player.bestStreak,
    player.streak,
  );

  const levelUp = applyLevelUp(player);

  updateAchievements(player);

  await updatePlayer(player);

  sessions.delete(player.userId);

  return {
    payout,
    xp,
    levelUp,
  };
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
