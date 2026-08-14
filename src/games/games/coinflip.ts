export type CoinSide = "heads" | "tails";

export function flipCoin(): CoinSide {
  return Math.random() < 0.5
    ? "heads"
    : "tails";
}
