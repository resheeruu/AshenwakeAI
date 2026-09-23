"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var inventory_exports = {};
__export(inventory_exports, {
  addItemToInventory: () => addItemToInventory,
  compareEquipment: () => compareEquipment,
  equipEquipment: () => equipEquipment,
  getInventoryItems: () => getInventoryItems,
  hasItem: () => hasItem,
  paginateInventory: () => paginateInventory,
  removeItemFromInventory: () => removeItemFromInventory,
  sellInventoryItem: () => sellInventoryItem,
  sortInventoryItems: () => sortInventoryItems,
  unequipEquipment: () => unequipEquipment,
  useConsumable: () => useConsumable
});
module.exports = __toCommonJS(inventory_exports);
var import_config = require("./config");
var import_equipment = require("./equipment");
const CONSUMABLE_ITEMS = {
  health_potion: {
    name: "\u{1F9EA} Health Potion",
    description: "Restores 50 HP.",
    emoji: "\u{1F9EA}",
    usable: true,
    sellable: true,
    sellValue: 25
  },
  greater_health_potion: {
    name: "\u{1F9EA} Greater Health Potion",
    description: "Restores 150 HP.",
    emoji: "\u{1F9EA}",
    usable: true,
    sellable: true,
    sellValue: 75
  },
  xp_boost: {
    name: "\u{1F9EA} XP Boost",
    description: "Doubles XP from your next hunt.",
    emoji: "\u{1F9EA}",
    usable: true,
    sellable: true,
    sellValue: 125
  },
  lucky_token: {
    name: "\u{1F340} Lucky Token",
    description: "Improves your next hunt's chance of finding rare loot.",
    emoji: "\u{1F340}",
    usable: true,
    sellable: true,
    sellValue: 250
  },
  repair_kit: {
    name: "\u{1F527} Repair Kit",
    description: "Fully restores equipment durability.",
    emoji: "\u{1F527}",
    usable: true,
    sellable: true,
    sellValue: 50
  },
  teleport_stone: {
    name: "\u{1FAA8} Teleport Stone",
    description: "Instantly travel to any unlocked region.",
    emoji: "\u{1FAA8}",
    usable: true,
    sellable: true,
    sellValue: 100
  }
};
const MATERIAL_ITEMS = {
  wolf_fang: {
    name: "\u{1F43A} Wolf Fang",
    description: "A fang collected from a dangerous wolf.",
    rarity: "common",
    emoji: "\u{1F43A}"
  },
  fox_charm: {
    name: "\u{1F98A} Fox Charm",
    description: "A mysterious charm discovered in a fox den.",
    rarity: "uncommon",
    emoji: "\u{1F98A}"
  },
  crystal_shard: {
    name: "\u{1F48E} Crystal Shard",
    description: "A rare crystal fragment from a hidden cave.",
    rarity: "rare",
    emoji: "\u{1F48E}"
  },
  ancient_relic: {
    name: "\u{1F451} Ancient Relic",
    description: "A legendary relic recovered from ancient ruins.",
    rarity: "legendary",
    emoji: "\u{1F451}"
  },
  dragon_scale: {
    name: "\u{1F409} Dragon Scale",
    description: "A scale from an ancient dragon.",
    rarity: "epic",
    emoji: "\u{1F409}"
  },
  void_essence: {
    name: "\u{1F441}\uFE0F Void Essence",
    description: "Essence harvested from the void.",
    rarity: "mythic",
    emoji: "\u{1F441}\uFE0F"
  },
  divine_orb: {
    name: "\u2728 Divine Orb",
    description: "A celestial orb of immense power.",
    rarity: "divine",
    emoji: "\u2728"
  }
};
function getInventoryItems(player) {
  const items = [];
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
        sellValue: consumable.sellValue
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
        sellValue: getMaterialSellValue(material.rarity)
      });
      continue;
    }
    items.push({
      id,
      name: id.replace(/_/g, " "),
      type: "material",
      quantity,
      sellable: true,
      sellValue: 10
    });
  }
  for (const equipment of player.equipment ?? []) {
    if (!equipment.equipped) {
      const rarityIndex = import_equipment.RARITIES.indexOf(equipment.rarity);
      items.push({
        id: equipment.id,
        name: `${equipment.name}`,
        type: "material",
        quantity: 1,
        description: `${equipment.slot} | ATK: ${equipment.attack} DEF: ${equipment.defense} HP: ${equipment.hp} LCK: ${equipment.luck}`,
        rarity: equipment.rarity,
        sellable: true,
        sellValue: getEquipmentSellValue(equipment)
      });
    }
  }
  return items;
}
function getMaterialSellValue(rarity) {
  switch (rarity) {
    case "common":
      return 5;
    case "uncommon":
      return 15;
    case "rare":
      return 40;
    case "epic":
      return 100;
    case "legendary":
      return 250;
    case "mythic":
      return 600;
    case "divine":
      return 1500;
    default:
      return 10;
  }
}
function getEquipmentSellValue(equipment) {
  const base = (equipment.attack + equipment.defense + equipment.hp + equipment.luck) * 2;
  const rarityMult = import_config.GAME_CONFIG.rarityMultipliers[equipment.rarity] ?? 1;
  return Math.floor(base * rarityMult);
}
function sortInventoryItems(items, mode) {
  const sorted = [...items];
  switch (mode) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "rarity": {
      const rarityOrder = {
        divine: 0,
        mythic: 1,
        legendary: 2,
        epic: 3,
        rare: 4,
        uncommon: 5,
        common: 6
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
function paginateInventory(items, page, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    currentPage,
    totalItems: items.length
  };
}
function sellInventoryItem(player, itemId, quantity) {
  if (quantity <= 0) {
    return { success: false, coins: 0, message: "Invalid quantity." };
  }
  const equipment = (player.equipment ?? []).find(
    (e) => e.id === itemId && !e.equipped
  );
  if (equipment) {
    const value = getEquipmentSellValue(equipment);
    const totalValue2 = value * quantity;
    if (quantity > 1) {
      return { success: false, coins: 0, message: "Equipment cannot be sold in bulk." };
    }
    player.equipment = player.equipment.filter((e) => e.id !== itemId);
    player.coins += totalValue2;
    return {
      success: true,
      coins: totalValue2,
      message: `Sold **${equipment.name}** for **${totalValue2} coins**.`
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
    message: `Sold **${quantity}x** items for **${totalValue} coins**.`
  };
}
function useConsumable(player, itemId) {
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
      return { success: true, message: "\u{1F9EA} You restore **50 HP**!" };
    case "greater_health_potion":
      player.hp = Math.min(player.maxHp, player.hp + 150);
      return { success: true, message: "\u{1F9EA} You restore **150 HP**!" };
    case "xp_boost":
      player.xpBoostActive = true;
      return { success: true, message: "\u{1F9EA} **XP Boost** activated! Double XP on your next hunt." };
    case "lucky_token":
      player.luckyTokenActive = true;
      return { success: true, message: "\u{1F340} **Lucky Token** activated! Better loot chances on your next hunt." };
    case "teleport_stone":
      return { success: true, message: "\u{1FAA8} You use the Teleport Stone. Choose a destination." };
    default:
      return { success: true, message: `You use **${consumable.name}**.` };
  }
}
function addItemToInventory(player, itemId, quantity = 1) {
  if (!player.inventory) {
    player.inventory = {};
  }
  player.inventory[itemId] = (player.inventory[itemId] ?? 0) + quantity;
}
function removeItemFromInventory(player, itemId, quantity = 1) {
  const current = player.inventory?.[itemId] ?? 0;
  if (current < quantity) return false;
  player.inventory[itemId] = current - quantity;
  if (player.inventory[itemId] <= 0) {
    delete player.inventory[itemId];
  }
  return true;
}
function hasItem(player, itemId, quantity = 1) {
  return (player.inventory?.[itemId] ?? 0) >= quantity;
}
function equipEquipment(player, equipmentId) {
  const equipment = player.equipment?.find((e) => e.id === equipmentId);
  if (!equipment) {
    return { success: false, message: "Equipment not found." };
  }
  if (equipment.equipped) {
    return { success: false, message: "That item is already equipped." };
  }
  const currentEquipped = player.equipment?.find(
    (e) => e.slot === equipment.slot && e.equipped
  );
  if (currentEquipped) {
    currentEquipped.equipped = false;
  }
  equipment.equipped = true;
  const slotName = import_equipment.SLOT_NAMES[equipment.slot] ?? equipment.slot;
  return {
    success: true,
    message: `Equipped **${equipment.name}** in ${slotName} slot.`,
    unequipped: currentEquipped?.name
  };
}
function unequipEquipment(player, slot) {
  const equipment = player.equipment?.find(
    (e) => e.slot === slot && e.equipped
  );
  if (!equipment) {
    return { success: false, message: `No equipment in ${slot} slot.` };
  }
  equipment.equipped = false;
  return {
    success: true,
    message: `Unequipped **${equipment.name}** from ${slot} slot.`
  };
}
function compareEquipment(player, equipmentId) {
  const incoming = player.equipment?.find((e) => e.id === equipmentId);
  if (!incoming) return null;
  const current = player.equipment?.find(
    (e) => e.slot === incoming.slot && e.equipped
  ) ?? null;
  return {
    current,
    incoming,
    stats: {
      attack: incoming.attack - (current?.attack ?? 0),
      defense: incoming.defense - (current?.defense ?? 0),
      hp: incoming.hp - (current?.hp ?? 0),
      luck: incoming.luck - (current?.luck ?? 0)
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addItemToInventory,
  compareEquipment,
  equipEquipment,
  getInventoryItems,
  hasItem,
  paginateInventory,
  removeItemFromInventory,
  sellInventoryItem,
  sortInventoryItems,
  unequipEquipment,
  useConsumable
});
