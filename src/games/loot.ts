import { GamePlayer } from "./types";
import { updatePlayer } from "./store";

export const LOOT_ITEMS = {
  wolf_fang: {
    name: "🐺 Wolf Fang",
    description: "A fang collected from a dangerous wolf.",
    rarity: "common",
  },
  fox_charm: {
    name: "🦊 Fox Charm",
    description: "A mysterious charm discovered in a fox den.",
    rarity: "uncommon",
  },
  crystal_shard: {
    name: "💎 Crystal Shard",
    description: "A rare crystal fragment from a hidden cave.",
    rarity: "rare",
  },
  ancient_relic: {
    name: "👑 Ancient Relic",
    description: "A legendary relic recovered from ancient ruins.",
    rarity: "legendary",
  },
} as const;

export type LootItemId = keyof typeof LOOT_ITEMS;

export function addItem(
  player: GamePlayer,
  itemId: string,
  amount = 1,
): void {
  if (!player.inventory) {
    player.inventory = {};
  }

  player.inventory[itemId] =
    (player.inventory[itemId] ?? 0) + amount;
}

export async function addItemAndSave(
  player: GamePlayer,
  itemId: string,
  amount = 1,
): Promise<void> {
  addItem(player, itemId, amount);
  await updatePlayer(player);
}

export function getInventory(
  player: GamePlayer,
): Record<string, number> {
  return player.inventory ?? {};
}

export function getLootForRarity(
  rarity: string,
): LootItemId | null {
  switch (rarity) {
    case "common":
      return "wolf_fang";
    case "uncommon":
      return "fox_charm";
    case "rare":
      return "crystal_shard";
    case "legendary":
      return "ancient_relic";
    default:
      return null;
  }
}
