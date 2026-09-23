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
var pets_exports = {};
__export(pets_exports, {
  PETS: () => PETS,
  addPet: () => addPet,
  addPetXp: () => addPetXp,
  calculatePetBonusAmount: () => calculatePetBonusAmount,
  evolvePet: () => evolvePet,
  getActivePet: () => getActivePet,
  getOwnedPet: () => getOwnedPet,
  getPet: () => getPet,
  getPetBonus: () => getPetBonus,
  getPlayerPets: () => getPlayerPets,
  setActivePet: () => setActivePet
});
module.exports = __toCommonJS(pets_exports);
const PETS = [
  {
    id: "cat",
    name: "Ashen Cat",
    emoji: "\u{1F431}",
    rarity: "common",
    ability: "coin_bonus",
    bonus: 5,
    description: "+5% coins earned."
  },
  {
    id: "fox",
    name: "Ember Fox",
    emoji: "\u{1F98A}",
    rarity: "rare",
    ability: "hunt_bonus",
    bonus: 8,
    description: "+8% hunt rewards."
  },
  {
    id: "dire_wolf",
    name: "Dire Wolf",
    emoji: "\u{1F43A}",
    rarity: "epic",
    ability: "combat_bonus",
    bonus: 10,
    description: "+10% combat power."
  },
  {
    id: "dragon",
    name: "Ashen Dragon",
    emoji: "\u{1F409}",
    rarity: "legendary",
    ability: "xp_bonus",
    bonus: 15,
    description: "+15% XP earned."
  },
  {
    id: "void_entity",
    name: "Void Entity",
    emoji: "\u{1F441}\uFE0F",
    rarity: "mythic",
    ability: "void",
    bonus: 20,
    description: "A mysterious entity with a unique void ability."
  }
];
const PET_XP_PER_LEVEL = 100;
function getPet(petId) {
  return PETS.find((pet) => pet.id === petId);
}
function getOwnedPet(player, petId) {
  const pets = getPlayerPets(player);
  return pets.find((pet) => pet.petId === petId);
}
function getPlayerPets(player) {
  return player.pets ?? [];
}
function savePlayerPets(player, pets) {
  player.pets = pets;
}
function addPet(player, petId) {
  const definition = getPet(petId);
  if (!definition) {
    throw new Error("INVALID_PET");
  }
  const pets = getPlayerPets(player);
  const existing = pets.find((pet2) => pet2.petId === petId);
  if (existing) {
    throw new Error("PET_ALREADY_OWNED");
  }
  const pet = {
    petId,
    level: 1,
    xp: 0,
    evolved: false,
    active: pets.length === 0
  };
  pets.push(pet);
  savePlayerPets(player, pets);
  return pet;
}
function addPetXp(player, petId, amount) {
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
function evolvePet(player, petId) {
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
function getPetBonus(player, ability) {
  let bonus = 0;
  for (const ownedPet of getPlayerPets(player)) {
    const definition = getPet(ownedPet.petId);
    if (!definition || definition.ability !== ability) {
      continue;
    }
    const levelMultiplier = 1 + Math.max(0, ownedPet.level - 1) * 0.05;
    const evolutionMultiplier = ownedPet.evolved ? 1.25 : 1;
    bonus += definition.bonus * levelMultiplier * evolutionMultiplier;
  }
  return bonus;
}
function getActivePet(player) {
  const pets = getPlayerPets(player);
  return pets.find((pet) => pet.active) ?? pets[0];
}
function setActivePet(player, petId) {
  const pets = getPlayerPets(player);
  const pet = pets.find((p) => p.petId === petId);
  if (!pet) {
    throw new Error("PET_NOT_OWNED");
  }
  for (const p of pets) {
    p.active = false;
  }
  pet.active = true;
  savePlayerPets(player, pets);
  return pet;
}
function calculatePetBonusAmount(baseAmount, bonusPercent) {
  if (baseAmount <= 0 || bonusPercent <= 0) {
    return 0;
  }
  return Math.floor(
    baseAmount * (bonusPercent / 100)
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PETS,
  addPet,
  addPetXp,
  calculatePetBonusAmount,
  evolvePet,
  getActivePet,
  getOwnedPet,
  getPet,
  getPetBonus,
  getPlayerPets,
  setActivePet
});
