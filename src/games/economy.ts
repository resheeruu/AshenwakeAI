import { GamePlayer } from "./types";
import { updatePlayer } from "./store";

export function canAfford(
  player: GamePlayer,
  amount: number,
): boolean {
  return Number.isFinite(amount) &&
    amount >= 0 &&
    player.coins >= amount;
}

export async function addCoins(
  player: GamePlayer,
  amount: number,
  _reason = "reward",
): Promise<number> {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("INVALID_COIN_AMOUNT");
  }

  player.coins += Math.floor(amount);
  await updatePlayer(player);

  return player.coins;
}

export async function spendCoins(
  player: GamePlayer,
  amount: number,
  _reason = "purchase",
): Promise<number> {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("INVALID_COIN_AMOUNT");
  }

  if (!canAfford(player, amount)) {
    throw new Error("INSUFFICIENT_COINS");
  }

  player.coins -= Math.floor(amount);
  await updatePlayer(player);

  return player.coins;
}

export async function transferCoins(
  from: GamePlayer,
  to: GamePlayer,
  amount: number,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_TRANSFER_AMOUNT");
  }

  const value = Math.floor(amount);

  if (!canAfford(from, value)) {
    throw new Error("INSUFFICIENT_COINS");
  }

  from.coins -= value;
  to.coins += value;

  await updatePlayer(from);
  await updatePlayer(to);
}
