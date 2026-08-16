import { GamePlayer } from "./types";

export type PetRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

export type PetAbility =
  | "coin_bonus"
  | "hunt_bonus"
  | "combat_bonus"
  | "xp_bonus"
  | "void";

export type PetDefinition = {
  id: string;
  name: string;
  emoji: string;
  rarity: PetRarity;
  ability: PetAbility;
  bonus: number;
  description: string;
};

export type OwnedPet = {
  petId: string;
  level: number;
  xp: number;
  evolved: boolean;
};

export const PETS: PetDefinition[] = [
  {
    id: "cat",
    name: "Ashen Cat",
    emoji: "🐱",
    rarity: "common",
    ability: "coin_bonus",
    bonus: 5,
    description: "+5% coins earned.",
  },
  {
    id: "fox",
    name: "Ember Fox",
    emoji: "🦊",
    rarity: "rare",
    ability: "hunt_bonus",
    bonus: 8,
    description: "+8% hunt rewards.",
  },
  {
    id: "dire_wolf",
    name: "Dire Wolf",
    emoji: "🐺",
    rarity: "epic",
    ability: "combat_bonus",
    bonus: 10,
    description: "+10% combat power.",
  },
  {
    id: "dragon",
    name: "Ashen Dragon",
    emoji: "🐉",
    rarity: "legendary",
    ability: "xp_bonus",
    bonus: 15,
    description: "+15% XP earned.",
  },
  {
    id: "void_entity",
    name: "Void Entity",
    emoji: "👁️",
    rarity: "mythic",
    ability: "void",
    bonus: 20,
    description: "A mysterious entity with a unique void ability.",
  },
];

const PET_XP_PER_LEVEL = 100;

export function getPet(petId: string): PetDefinition | undefined {
  return PETS.find((pet) => pet.id === petId);
}

export function getOwnedPet(
  player: GamePlayer,
  petId: string,
): OwnedPet | undefined {
  const pets = getPlayerPets(player);
  return pets.find((pet) => pet.petId === petId);
}

export function getPlayerPets(player: GamePlayer): OwnedPet[] {
  const raw = (player as GamePlayer & { pets?: OwnedPet[] }).pets;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw;
}

function savePlayerPets(
  player: GamePlayer,
  pets: OwnedPet[],
): void {
  (player as GamePlayer & { pets?: OwnedPet[] }).pets = pets;
}

export function addPet(
  player: GamePlayer,
  petId: string,
): OwnedPet {
  const definition = getPet(petId);

  if (!definition) {
    throw new Error("INVALID_PET");
  }

  const pets = getPlayerPets(player);

  const existing = pets.find((pet) => pet.petId === petId);

  if (existing) {
    throw new Error("PET_ALREADY_OWNED");
  }

  const pet: OwnedPet = {
    petId,
    level: 1,
    xp: 0,
    evolved: false,
  };

  pets.push(pet);
  savePlayerPets(player, pets);

  return pet;
}

export function addPetXp(
  player: GamePlayer,
  petId: string,
  amount: number,
): OwnedPet {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_PET_XP");
  }

  const pet = getOwnedPet(player, petId);

  if (!pet) {
    throw new Error("PET_NOT_OWNED");
  }

  pet.xp += Math.floor(amount);

  while (pet.xp >= pet.level * PET_XP_PER_LEVEL) {
    pet.xp -= pet.level * PET_XP_PER_LEVEL;
    pet.level++;
  }

  return pet;
}

export function evolvePet(
  player: GamePlayer,
  petId: string,
): OwnedPet {
  const pet = getOwnedPet(player, petId);

  if (!pet) {
    throw new Error("PET_NOT_OWNED");
  }

  if (pet.level < 10) {
    throw new Error("PET_LEVEL_TOO_LOW");
  }

  if (pet.evolved) {
    throw new Error("PET_ALREADY_EVOLVED");
  }

  pet.evolved = true;

  return pet;
}

export function getPetBonus(
  player: GamePlayer,
  ability: PetAbility,
): number {
  let bonus = 0;

  for (const ownedPet of getPlayerPets(player)) {
    const definition = getPet(ownedPet.petId);

    if (!definition || definition.ability !== ability) {
      continue;
    }

    const levelMultiplier =
      1 + Math.max(0, ownedPet.level - 1) * 0.05;

    const evolutionMultiplier = ownedPet.evolved ? 1.25 : 1;

    bonus +=
      definition.bonus *
      levelMultiplier *
      evolutionMultiplier;
  }

  return bonus;
}

export function getActivePet(
  player: GamePlayer,
): OwnedPet | undefined {
  const pets = getPlayerPets(player);

  return pets[0];
}

export function calculatePetBonusAmount(
  baseAmount: number,
  bonusPercent: number,
): number {
  if (baseAmount <= 0 || bonusPercent <= 0) {
    return 0;
  }

  return Math.floor(
    baseAmount * (bonusPercent / 100),
  );
}
