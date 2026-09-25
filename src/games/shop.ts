import { GamePlayer } from "./types";
import { mutatePlayer } from "./store";

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

export type PurchaseResult = {
  success: boolean;
  message: string;
  player: GamePlayer | null;
};

/**
 * Purchase an item.
 *
 * The affordability check and the deduction run inside one mutatePlayer
 * critical section. Checking on a snapshot fetched earlier (and writing it
 * back afterwards) let two concurrent purchases both pass the same
 * "coins >= price" check and both receive the item for one deduction.
 */
export async function buyItem(
  userId: string,
  username: string,
  itemId: ShopItemId,
): Promise<PurchaseResult> {
  const item = SHOP_ITEMS[itemId];

  if (!item) {
    return {
      success: false,
      message: "❌ That shop item does not exist.",
      player: null,
    };
  }

  const { player, result } = await mutatePlayer(
    userId,
    (p): { success: boolean; message: string } => {
      if (!p.inventory) {
        p.inventory = {};
      }

      // VIP Badge is permanent and cannot be purchased twice.
      if (
        itemId === "vip_badge" &&
        (p.inventory.vip_badge ?? 0) > 0
      ) {
        return {
          success: false,
          message: "👑 You already own the VIP Badge.",
        };
      }

      if (p.coins < item.price) {
        return {
          success: false,
          message:
            `❌ You need **${item.price} coins**, ` +
            `but you only have **${p.coins}**.`,
        };
      }

      p.coins -= item.price;

      p.inventory[itemId] =
        (p.inventory[itemId] ?? 0) + 1;

      return {
        success: true,
        message:
          `✅ You purchased **${item.name}** for ` +
          `**${item.price} coins**!`,
      };
    },
    username,
  );

  return { ...result, player };
}
