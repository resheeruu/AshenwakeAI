import { GamePlayer, Equipment, EquipmentSlot } from "./types";
import { GAME_CONFIG } from "./config";
import {
  createEquipment,
  addEquipment,
  getEquippedItems,
  RARITIES,
  SLOT_NAMES,
} from "./equipment";

export type InventoryItem = {
  id: string;
  name: string;
  type: "consumable" | "material" | "quest" | "currency";
  quantity: number;
  description?: string;
  rarity?: string;
  usable?: boolean;
  sellable?: boolean;
  sellValue?: number;
};

export type InventorySortMode = "name" | "rarity" | "type" | "quantity";

const CONSUMABLE_ITEMS: Record<string, { name: string; emoji: string; description: string; usable: boolean; sellable: boolean; sellValue: number }> = {
  health_potion: {
    name: "🧪 Health Potion",
    description: "Restores 50 HP.",
    emoji: "🧪",
    usable: true,
    sellable: true,
    sellValue: 25,
  },
  greater_health_potion: {
    name: "🧪 Greater Health Potion",
    description: "Restores 150 HP.",
    emoji: "🧪",
    usable: true,
    sellable: true,
    sellValue: 75,
  },
  xp_boost: {
    name: "🧪 XP Boost",
    description: "Doubles XP from your next hunt.",
    emoji: "🧪",
    usable: true,
    sellable: true,
    sellValue: 125,
  },
  lucky_token: {
    name: "🍀 Lucky Token",
    description: "Improves your next hunt's chance of finding rare loot.",
    emoji: "🍀",
    usable: true,
    sellable: true,
    sellValue: 250,
  },
  repair_kit: {
    name: "🔧 Repair Kit",
    description: "Fully restores equipment durability.",
    emoji: "🔧",
    usable: true,
    sellable: true,
    sellValue: 50,
  },
  teleport_stone: {
    name: "🪨 Teleport Stone",
    description: "Instantly travel to any unlocked region.",
    emoji: "🪨",
    usable: true,
    sellable: true,
    sellValue: 100,
  },
};

const MATERIAL_ITEMS: Record<string, { name: string; emoji: string; description: string; rarity: string }> = {
  wolf_fang: {
    name: "🐺 Wolf Fang",
    description: "A fang collected from a dangerous wolf.",
    rarity: "common",
    emoji: "🐺",
  },
  fox_charm: {
    name: "🦊 Fox Charm",
    description: "A mysterious charm discovered in a fox den.",
    rarity: "uncommon",
    emoji: "🦊",
  },
  crystal_shard: {
    name: "💎 Crystal Shard",
    description: "A rare crystal fragment from a hidden cave.",
    rarity: "rare",
    emoji: "💎",
  },
  ancient_relic: {
    name: "👑 Ancient Relic",
    description: "A legendary relic recovered from ancient ruins.",
    rarity: "legendary",
    emoji: "👑",
  },
  dragon_scale: {
    name: "🐉 Dragon Scale",
    description: "A scale from an ancient dragon.",
    rarity: "epic",
    emoji: "🐉",
  },
  void_essence: {
    name: "👁️ Void Essence",
    description: "Essence harvested from the void.",
    rarity: "mythic",
    emoji: "👁️",
  },
  divine_orb: {
    name: "✨ Divine Orb",
    description: "A celestial orb of immense power.",
    rarity: "divine",
    emoji: "✨",
  },
};

export function getInventoryItems(player: GamePlayer): InventoryItem[] {
  const items: InventoryItem[] = [];

  for (const [id, quantity] of Object.entries(player.inventory ?? {})) {
    if (quantity <= 0) continue;

    const consumable = CONSUMABLE_ITEMS[id];
    if (consumable) {
      items.push({
        id,
        name: `${consumable.emoji} ${consumable.name}`,
        type: "consumable",
        quantity,
        description: consumable.description,
        usable: consumable.usable,
        sellable: consumable.sellable,
        sellValue: consumable.sellValue,
      });
      continue;
    }

    const material = MATERIAL_ITEMS[id];
    if (material) {
      items.push({
        id,
        name: `${material.emoji} ${material.name}`,
        type: "material",
        quantity,
        description: material.description,
        rarity: material.rarity,
        sellable: true,
        sellValue: getMaterialSellValue(material.rarity),
      });
      continue;
    }

    items.push({
      id,
      name: id.replace(/_/g, " "),
      type: "material",
      quantity,
      sellable: true,
      sellValue: 10,
    });
  }

  for (const equipment of player.equipment ?? []) {
    if (!equipment.equipped) {
      const rarityIndex = RARITIES.indexOf(equipment.rarity);
      items.push({
        id: equipment.id,
        name: `${equipment.name}`,
        type: "material",
        quantity: 1,
        description: `${equipment.slot} | ATK: ${equipment.attack} DEF: ${equipment.defense} HP: ${equipment.hp} LCK: ${equipment.luck}`,
        rarity: equipment.rarity,
        sellable: true,
        sellValue: getEquipmentSellValue(equipment),
      });
    }
  }

  return items;
}

function getMaterialSellValue(rarity: string): number {
  switch (rarity) {
    case "common": return 5;
    case "uncommon": return 15;
    case "rare": return 40;
    case "epic": return 100;
    case "legendary": return 250;
    case "mythic": return 600;
    case "divine": return 1500;
    default: return 10;
  }
}

function getEquipmentSellValue(equipment: Equipment): number {
  const base = (equipment.attack + equipment.defense + equipment.hp + equipment.luck) * 2;
  const rarityMult = GAME_CONFIG.rarityMultipliers[equipment.rarity] ?? 1;
  return Math.floor(base * rarityMult);
}

export function sortInventoryItems(
  items: InventoryItem[],
  mode: InventorySortMode,
): InventoryItem[] {
  const sorted = [...items];

  switch (mode) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "rarity": {
      const rarityOrder: Record<string, number> = {
        divine: 0, mythic: 1, legendary: 2, epic: 3, rare: 4, uncommon: 5, common: 6,
      };
      sorted.sort((a, b) => (rarityOrder[a.rarity ?? "common"] ?? 7) - (rarityOrder[b.rarity ?? "common"] ?? 7));
      break;
    }
    case "type":
      sorted.sort((a, b) => a.type.localeCompare(b.type));
      break;
    case "quantity":
      sorted.sort((a, b) => b.quantity - a.quantity);
      break;
  }

  return sorted;
}

export function paginateInventory(
  items: InventoryItem[],
  page: number,
  pageSize = 10,
): { items: InventoryItem[]; totalPages: number; currentPage: number; totalItems: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    currentPage,
    totalItems: items.length,
  };
}

export function sellInventoryItem(
  player: GamePlayer,
  itemId: string,
  quantity: number,
): { success: boolean; coins: number; message: string } {
  if (quantity <= 0) {
    return { success: false, coins: 0, message: "Invalid quantity." };
  }

  const equipment = (player.equipment ?? []).find(
    (e) => e.id === itemId && !e.equipped,
  );

  if (equipment) {
    const value = getEquipmentSellValue(equipment);
    const totalValue = value * quantity;

    if (quantity > 1) {
      return { success: false, coins: 0, message: "Equipment cannot be sold in bulk." };
    }

    player.equipment = player.equipment.filter((e) => e.id !== itemId);
    player.coins += totalValue;

    return {
      success: true,
      coins: totalValue,
      message: `Sold **${equipment.name}** for **${totalValue} coins**.`,
    };
  }

  const currentQty = player.inventory?.[itemId] ?? 0;
  if (currentQty < quantity) {
    return { success: false, coins: 0, message: "Insufficient quantity." };
  }

  const consumable = CONSUMABLE_ITEMS[itemId];
  const material = MATERIAL_ITEMS[itemId];
  const rarity = material?.rarity ?? "common";
  const baseValue = consumable?.sellValue ?? getMaterialSellValue(rarity);
  const totalValue = baseValue * quantity;

  player.inventory[itemId] = currentQty - quantity;
  if (player.inventory[itemId] <= 0) {
    delete player.inventory[itemId];
  }

  player.coins += totalValue;

  return {
    success: true,
    coins: totalValue,
    message: `Sold **${quantity}x** items for **${totalValue} coins**.`,
  };
}

export function useConsumable(
  player: GamePlayer,
  itemId: string,
): { success: boolean; message: string } {
  const consumable = CONSUMABLE_ITEMS[itemId];
  if (!consumable) {
    return { success: false, message: "That item cannot be used." };
  }

  const qty = player.inventory?.[itemId] ?? 0;
  if (qty <= 0) {
    return { success: false, message: "You don't have that item." };
  }

  player.inventory[itemId] = qty - 1;
  if (player.inventory[itemId] <= 0) {
    delete player.inventory[itemId];
  }

  switch (itemId) {
    case "health_potion":
      player.hp = Math.min(player.maxHp, player.hp + 50);
      return { success: true, message: "🧪 You restore **50 HP**!" };
    case "greater_health_potion":
      player.hp = Math.min(player.maxHp, player.hp + 150);
      return { success: true, message: "🧪 You restore **150 HP**!" };
    case "xp_boost":
      player.xpBoostActive = true;
      return { success: true, message: "🧪 **XP Boost** activated! Double XP on your next hunt." };
    case "lucky_token":
      player.luckyTokenActive = true;
      return { success: true, message: "🍀 **Lucky Token** activated! Better loot chances on your next hunt." };
    case "teleport_stone":
      return { success: true, message: "🪨 You use the Teleport Stone. Choose a destination." };
    default:
      return { success: true, message: `You use **${consumable.name}**.` };
  }
}

export function addItemToInventory(
  player: GamePlayer,
  itemId: string,
  quantity = 1,
): void {
  if (!player.inventory) {
    player.inventory = {};
  }
  player.inventory[itemId] = (player.inventory[itemId] ?? 0) + quantity;
}

export function removeItemFromInventory(
  player: GamePlayer,
  itemId: string,
  quantity = 1,
): boolean {
  const current = player.inventory?.[itemId] ?? 0;
  if (current < quantity) return false;

  player.inventory[itemId] = current - quantity;
  if (player.inventory[itemId] <= 0) {
    delete player.inventory[itemId];
  }
  return true;
}

export function hasItem(
  player: GamePlayer,
  itemId: string,
  quantity = 1,
): boolean {
  return (player.inventory?.[itemId] ?? 0) >= quantity;
}

export function equipEquipment(
  player: GamePlayer,
  equipmentId: string,
): { success: boolean; message: string; unequipped?: string } {
  const equipment = player.equipment?.find((e) => e.id === equipmentId);
  if (!equipment) {
    return { success: false, message: "Equipment not found." };
  }

  if (equipment.equipped) {
    return { success: false, message: "That item is already equipped." };
  }

  const currentEquipped = player.equipment?.find(
    (e) => e.slot === equipment.slot && e.equipped,
  );

  if (currentEquipped) {
    currentEquipped.equipped = false;
  }

  equipment.equipped = true;

  const slotName = SLOT_NAMES[equipment.slot] ?? equipment.slot;

  return {
    success: true,
    message: `Equipped **${equipment.name}** in ${slotName} slot.`,
    unequipped: currentEquipped?.name,
  };
}

export function unequipEquipment(
  player: GamePlayer,
  slot: EquipmentSlot,
): { success: boolean; message: string } {
  const equipment = player.equipment?.find(
    (e) => e.slot === slot && e.equipped,
  );

  if (!equipment) {
    return { success: false, message: `No equipment in ${slot} slot.` };
  }

  equipment.equipped = false;

  return {
    success: true,
    message: `Unequipped **${equipment.name}** from ${slot} slot.`,
  };
}

export function compareEquipment(
  player: GamePlayer,
  equipmentId: string,
): { current: Equipment | null; incoming: Equipment; stats: { attack: number; defense: number; hp: number; luck: number } } | null {
  const incoming = player.equipment?.find((e) => e.id === equipmentId);
  if (!incoming) return null;

  const current = player.equipment?.find(
    (e) => e.slot === incoming.slot && e.equipped,
  ) ?? null;

  return {
    current,
    incoming,
    stats: {
      attack: incoming.attack - (current?.attack ?? 0),
      defense: incoming.defense - (current?.defense ?? 0),
      hp: incoming.hp - (current?.hp ?? 0),
      luck: incoming.luck - (current?.luck ?? 0),
    },
  };
}
