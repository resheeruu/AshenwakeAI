import { GamePlayer } from "./types";
import { updatePlayer } from "./store";

export const SHOP_ITEMS = {
  xp_boost: {
    name: "🧪 XP Boost",
    description: "Doubles XP from your next hunt.",
    price: 250,
  },
  lucky_token: {
    name: "🍀 Lucky Token",
    description: "Improves your next hunt's chance of finding rare loot.",
    price: 500,
  },
  vip_badge: {
    name: "👑 VIP Badge",
    description: "A permanent prestigious AshenAI game badge.",
    price: 1000,
  },
} as const;

export type ShopItemId = keyof typeof SHOP_ITEMS;

export async function buyItem(
  player: GamePlayer,
  itemId: ShopItemId,
): Promise<{
  success: boolean;
  message: string;
}> {
  const item = SHOP_ITEMS[itemId];

  if (!item) {
    return {
      success: false,
      message: "❌ That shop item does not exist.",
    };
  }

  if (!player.inventory) {
    player.inventory = {};
  }

  // VIP Badge is permanent and cannot be purchased twice.
  if (
    itemId === "vip_badge" &&
    (player.inventory.vip_badge ?? 0) > 0
  ) {
    return {
      success: false,
      message: "👑 You already own the VIP Badge.",
    };
  }

  if (player.coins < item.price) {
    return {
      success: false,
      message:
        `❌ You need **${item.price} coins**, ` +
        `but you only have **${player.coins}**.`,
    };
  }

  player.coins -= item.price;

  player.inventory[itemId] =
    (player.inventory[itemId] ?? 0) + 1;

  await updatePlayer(player);

  return {
    success: true,
    message:
      `✅ You purchased **${item.name}** for ` +
      `**${item.price} coins**!`,
  };
}
