import { GamePlayer } from "../types";

export type DuelTurnResult = {
  attackerDamage: number;
  critical: boolean;
  defenderHp: number;
};

export type DuelResult = {
  winner: GamePlayer;
  loser: GamePlayer;
  turns: number;
};

function calculateDamage(
  attacker: GamePlayer,
  defender: GamePlayer,
): { damage: number; critical: boolean } {
  const critical = Math.random() < 0.15;

  const baseDamage = Math.max(
    1,
    attacker.attack - Math.floor(defender.defense * 0.5),
  );

  const variance =
    Math.floor(Math.random() * 7) - 3;

  const damage = Math.max(
    1,
    baseDamage + variance,
  );

  return {
    damage: critical
      ? Math.max(2, damage * 2)
      : damage,
    critical,
  };
}

export function simulateDuel(
  first: GamePlayer,
  second: GamePlayer,
): DuelResult {
  const firstHp = first.hp;
  const secondHp = second.hp;

  let hp1 = firstHp;
  let hp2 = secondHp;
  let turns = 0;

  while (hp1 > 0 && hp2 > 0 && turns < 100) {
    turns++;

    const attack1 = calculateDamage(
      first,
      second,
    );

    hp2 -= attack1.damage;

    if (hp2 <= 0) {
      return {
        winner: first,
        loser: second,
        turns,
      };
    }

    turns++;

    const attack2 = calculateDamage(
      second,
      first,
    );

    hp1 -= attack2.damage;

    if (hp1 <= 0) {
      return {
        winner: second,
        loser: first,
        turns,
      };
    }
  }

  return hp1 >= hp2
    ? {
        winner: first,
        loser: second,
        turns,
      }
    : {
        winner: second,
        loser: first,
        turns,
      };
}
