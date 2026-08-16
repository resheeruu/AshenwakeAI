import { Equipment, EquipmentSlot, GamePlayer, Rarity } from "./types";

const RARITIES: Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

const RARITY_MULTIPLIER: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.25,
  rare: 1.6,
  epic: 2.1,
  legendary: 2.8,
  mythic: 3.8,
};

const SLOT_NAMES: Record<EquipmentSlot, string> = {
  weapon: "Weapon",
  armor: "Armor",
  helmet: "Helmet",
  boots: "Boots",
  ring: "Ring",
  amulet: "Amulet",
};

const SLOT_EMOJIS: Record<EquipmentSlot, string> = {
  weapon: "⚔️",
  armor: "🛡️",
  helmet: "🪖",
  boots: "👢",
  ring: "💍",
  amulet: "📿",
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollRarity(): Rarity {
  const roll = Math.random();

  if (roll < 0.01) return "mythic";
  if (roll < 0.04) return "legendary";
  if (roll < 0.10) return "epic";
  if (roll < 0.25) return "rare";
  if (roll < 0.50) return "uncommon";

  return "common";
}

function basePowerForLevel(level: number): number {
  return Math.max(1, level * 2);
}

export function rollEquipmentRarity(): Rarity {
  return rollRarity();
}

function normalizeEquipmentSlot(templateOrSlot: EquipmentSlot | string): EquipmentSlot {
  const value = templateOrSlot.toLowerCase();

  if (
    value === "weapon" ||
    value === "armor" ||
    value === "helmet" ||
    value === "boots" ||
    value === "ring" ||
    value === "amulet"
  ) {
    return value;
  }

  if (value.includes("weapon") || value.includes("sword") || value.includes("blade")) {
    return "weapon";
  }

  if (value.includes("armor") || value.includes("chest") || value.includes("plate")) {
    return "armor";
  }

  if (value.includes("helmet") || value.includes("helm")) {
    return "helmet";
  }

  if (value.includes("boot") || value.includes("shoe")) {
    return "boots";
  }

  if (value.includes("ring")) {
    return "ring";
  }

  if (value.includes("amulet") || value.includes("necklace")) {
    return "amulet";
  }

  // Preserve compatibility with existing reward tables that use
  // arbitrary equipment template IDs.
  return "weapon";
}

export function createEquipment(
  templateOrSlot: EquipmentSlot | string,
  levelOrRarity?: number | Rarity,
  forcedRarity?: Rarity,
): Equipment {
  const slot: EquipmentSlot =
    typeof levelOrRarity === "string"
      ? normalizeEquipmentSlot(templateOrSlot)
      : normalizeEquipmentSlot(templateOrSlot);

  const playerLevel =
    typeof levelOrRarity === "number"
      ? levelOrRarity
      : 1;

  const rarity: Rarity =
    typeof levelOrRarity === "string"
      ? levelOrRarity
      : forcedRarity ?? rollRarity();

  const multiplier = RARITY_MULTIPLIER[rarity];

  const base = basePowerForLevel(playerLevel);

  const primary = Math.max(
    1,
    Math.floor(
      base *
        multiplier *
        (0.8 + Math.random() * 0.4),
    ),
  );

  let attack = 0;
  let defense = 0;
  let hp = 0;
  let luck = 0;

  switch (slot) {
    case "weapon":
      attack = primary;
      break;

    case "armor":
      defense = primary;
      hp = Math.floor(primary * 2);
      break;

    case "helmet":
      defense = Math.floor(primary * 0.7);
      hp = Math.floor(primary * 1.5);
      break;

    case "boots":
      defense = Math.floor(primary * 0.5);
      luck = Math.max(1, Math.floor(primary * 0.25));
      break;

    case "ring":
      attack = Math.floor(primary * 0.5);
      luck = Math.max(1, Math.floor(primary * 0.4));
      break;

    case "amulet":
      hp = Math.floor(primary * 1.5);
      attack = Math.floor(primary * 0.35);
      luck = Math.max(1, Math.floor(primary * 0.25));
      break;
  }

  return {
    id: `${slot}_${rarity}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    name: `${rarity} ${slot}`,
    slot,
    rarity,
    attack,
    defense,
    hp,
    luck,
    equipped: false,
  };
}

export function addEquipment(
  player: GamePlayer,
  equipment: Equipment,
): Equipment;
export function addEquipment(
  player: GamePlayer,
  templateId: string,
  rarity?: Rarity,
): Equipment;
export function addEquipment(
  player: GamePlayer,
  equipmentOrTemplate: Equipment | string,
  rarity?: Rarity,
): Equipment {
  player.equipment ??= [];

  if (typeof equipmentOrTemplate !== "string") {
    player.equipment.push(equipmentOrTemplate);
    return equipmentOrTemplate;
  }

  const item = createEquipment(
    equipmentOrTemplate,
    player.level,
    rarity,
  );

  player.equipment.push(item);

  return item;
}

export function getEquippedItems(player: GamePlayer): Equipment[] {
  return (player.equipment ?? []).filter((item) => item.equipped);
}

export function getEquipmentPower(equipment: Equipment): number {
  return (
    equipment.attack +
    equipment.defense +
    equipment.hp +
    equipment.luck
  );
}

export function getTotalEquipmentPower(player: GamePlayer): number {
  return getEquippedItems(player).reduce(
    (total, equipment) => total + getEquipmentPower(equipment),
    0,
  );
}

export function getEquipmentSummary(player: GamePlayer): string {
  const slots: EquipmentSlot[] = [
    "weapon",
    "armor",
    "helmet",
    "boots",
    "ring",
    "amulet",
  ];

  return slots
    .map((slot) => {
      const item = player.equipment.find(
        (equipment) =>
          equipment.slot === slot && equipment.equipped,
      );

      return item
        ? `${SLOT_EMOJIS[slot]} **${item.name}**`
        : `${SLOT_EMOJIS[slot]} Empty`;
    })
    .join("\n");
}

export { RARITIES, RARITY_MULTIPLIER, SLOT_NAMES, SLOT_EMOJIS };

    
export function getEquipmentStats(player: GamePlayer): {
  attack: number;
  defense: number;
  hp: number;
  luck: number;
} {
  const equipped = (player.equipment ?? []).filter(
    (item) => item.equipped,
  );

  return equipped.reduce(
    (stats, item) => ({
      attack: stats.attack + (item.attack ?? 0),
      defense: stats.defense + (item.defense ?? 0),
      hp: stats.hp + (item.hp ?? 0),
      luck: stats.luck + (item.luck ?? 0),
    }),
    {
      attack: 0,
      defense: 0,
      hp: 0,
      luck: 0,
    },
  );
}
