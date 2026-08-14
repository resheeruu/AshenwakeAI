export type RPSChoice = "rock" | "paper" | "scissors";

export function playRPS(
  player: RPSChoice,
  bot: RPSChoice,
): "win" | "loss" | "draw" {
  if (player === bot) return "draw";

  if (
    (player === "rock" && bot === "scissors") ||
    (player === "paper" && bot === "rock") ||
    (player === "scissors" && bot === "paper")
  ) {
    return "win";
  }

  return "loss";
}

export function randomRPS(): RPSChoice {
  const choices: RPSChoice[] = ["rock", "paper", "scissors"];
  return choices[Math.floor(Math.random() * choices.length)];
}
