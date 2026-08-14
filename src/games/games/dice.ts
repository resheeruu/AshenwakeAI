export function rollDice(sides = 6): number {
  if (!Number.isInteger(sides) || sides < 2 || sides > 100) {
    throw new Error("Dice must have between 2 and 100 sides.");
  }

  return Math.floor(Math.random() * sides) + 1;
}
