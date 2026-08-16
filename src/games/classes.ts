import { GamePlayer } from "./types";

export type PlayerClassId =
  | "warrior"
  | "rogue"
  | "mage";

export type PlayerClass = {
  id: PlayerClassId;
  name: string;
  emoji: string;
  description: string;
  attack: number;
  defense: number;
  maxHp: number;
};

export const PLAYER_CLASSES: PlayerClass[] = [
  {
    id: "warrior",
    name: "Ashen Warrior",
    emoji: "⚔️",
    description: "A durable fighter with high HP and defense.",
    attack: 18,
    defense: 9,
    maxHp: 120,
  },
  {
    id: "rogue",
    name: "Shadow Rogue",
    emoji: "🗡️",
    description: "A fast assassin with powerful attacks.",
    attack: 24,
    defense: 5,
    maxHp: 90,
  },
  {
    id: "mage",
    name: "Ember Mage",
    emoji: "🔥",
    description: "A fragile spellcaster with devastating attacks.",
    attack: 30,
    defense: 3,
    maxHp: 80,
  },
];

export function getPlayerClass(
  id: string | undefined,
): PlayerClass | undefined {
  return PLAYER_CLASSES.find((playerClass) => playerClass.id === id);
}

export function choosePlayerClass(
  player: GamePlayer,
  classId: string,
): PlayerClass {
  const selectedClass = getPlayerClass(classId);

  if (!selectedClass) {
    throw new Error("INVALID_CLASS");
  }

  player.classId = selectedClass.id;
  player.attack = selectedClass.attack;
  player.defense = selectedClass.defense;
  player.maxHp = selectedClass.maxHp;
  player.hp = selectedClass.maxHp;

  return selectedClass;
}
