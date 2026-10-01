/* Temporary evidence script — battle deadlock repro. DELETE AFTER RUN. */
import { playBattle } from "../src/games/games/battle";
import { getPlayer } from "../src/games/store";

async function main(): Promise<void> {
  const t0 = Date.now();
  try {
    const p = await getPlayer("repro-user", "Repro");
    console.log("initial coins:", p.coins);
    const r = await playBattle("repro-user", "Repro");
    console.log("playBattle OK in", Date.now() - t0, "ms:", JSON.stringify(r));
    const after = await getPlayer("repro-user", "Repro");
    console.log("after coins:", after.coins, "gamesPlayed:", after.gamesPlayed, "wins:", after.wins, "losses:", after.losses, "draws:", after.draws);
  } catch (e) {
    console.log("playBattle FAILED after", Date.now() - t0, "ms:", (e as Error).message);
  }
  process.exit(0);
}
void main();
