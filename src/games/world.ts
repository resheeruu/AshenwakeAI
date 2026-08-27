import { GamePlayer } from "./types";

export type RegionId =
  | "ashen_village"
  | "blackwood"
  | "crimson_wastes"
  | "abyss"
  | "celestial_realm";

export type Region = {
  id: RegionId;
  name: string;
  emoji: string;
  description: string;
  minLevel: number;
  minReputation: number;
  danger: number;
};

export const REGIONS: Region[] = [
  {
    id: "ashen_village",
    name: "Ashen Village",
    emoji: "🏘️",
    description: "The quiet beginning of your journey.",
    minLevel: 1,
    minReputation: 0,
    danger: 1,
  },
  {
    id: "blackwood",
    name: "Blackwood",
    emoji: "🌲",
    description: "A cursed forest where ancient creatures hunt.",
    minLevel: 5,
    minReputation: 25,
    danger: 2,
  },
  {
    id: "crimson_wastes",
    name: "Crimson Wastes",
    emoji: "🌋",
    description: "A burning wasteland ruled by demons and dragons.",
    minLevel: 15,
    minReputation: 100,
    danger: 4,
  },
  {
    id: "abyss",
    name: "The Abyss",
    emoji: "🌑",
    description: "A realm where reality itself begins to collapse.",
    minLevel: 30,
    minReputation: 300,
    danger: 7,
  },
  {
    id: "celestial_realm",
    name: "Celestial Realm",
    emoji: "✨",
    description: "The domain of beings beyond mortal power.",
    minLevel: 50,
    minReputation: 750,
    danger: 10,
  },
];

export function getRegion(id: string | undefined): Region {
  return (
    REGIONS.find((region) => region.id === id) ??
    REGIONS[0]
  );
}

export function getNextRegion(
  player: GamePlayer,
): Region | undefined {
  const currentIndex = REGIONS.findIndex(
    (region) => region.id === player.regionId,
  );

  if (currentIndex < 0 || currentIndex >= REGIONS.length - 1) {
    return undefined;
  }

  return REGIONS[currentIndex + 1];
}

export function canUnlockRegion(
  player: GamePlayer,
  region: Region,
): boolean {
  return (
    player.level >= region.minLevel &&
    player.reputation >= region.minReputation
  );
}

export function unlockAvailableRegion(
  player: GamePlayer,
): Region | undefined {
  const next = getNextRegion(player);

  if (!next || !canUnlockRegion(player, next)) {
    return undefined;
  }

  player.regionId = next.id;

  if (!player.unlockedRegions) {
    player.unlockedRegions = [];
  }

  if (!player.unlockedRegions.includes(next.id)) {
    player.unlockedRegions.push(next.id);
  }

  if (!player.titles.includes("region_pioneer")) {
    player.titles.push("region_pioneer");
  }

  return next;
}

export function isRegionUnlocked(
  player: GamePlayer,
  regionId: string,
): boolean {
  if (!player.unlockedRegions) {
    return player.regionId === regionId || regionId === "ashen_village";
  }

  return player.unlockedRegions.includes(regionId);
}

export function setPlayerRegion(
  player: GamePlayer,
  regionId: string,
): Region {
  if (!isRegionUnlocked(player, regionId)) {
    throw new Error("REGION_NOT_UNLOCKED");
  }

  const region = getRegion(regionId);
  player.regionId = regionId;

  return region;
}
