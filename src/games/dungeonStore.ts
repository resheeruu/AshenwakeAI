import fs from "fs";
import path from "path";
import { DungeonState } from "./dungeons";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "dungeons.json");

async function ensureStore(): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  if (!fs.existsSync(FILE)) {
    await fs.promises.writeFile(FILE, "{}", "utf8");
  }
}

export async function loadDungeons(): Promise<Record<string, DungeonState>> {
  await ensureStore();

  try {
    const raw = await fs.promises.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveDungeons(
  dungeons: Record<string, DungeonState>,
): Promise<void> {
  await ensureStore();

  const temporary = `${FILE}.tmp`;

  await fs.promises.writeFile(
    temporary,
    JSON.stringify(dungeons, null, 2),
    "utf8",
  );

  await fs.promises.rename(temporary, FILE);
}

export async function getDungeonState(
  dungeonId: string,
): Promise<DungeonState | undefined> {
  const dungeons = await loadDungeons();
  return dungeons[dungeonId];
}

export async function createDungeonState(
  state: DungeonState,
): Promise<void> {
  const dungeons = await loadDungeons();

  dungeons[state.id] = state;

  await saveDungeons(dungeons);
}

export async function updateDungeonState(
  state: DungeonState,
): Promise<void> {
  const dungeons = await loadDungeons();

  dungeons[state.id] = state;

  await saveDungeons(dungeons);
}

export async function deleteDungeonState(
  dungeonId: string,
): Promise<void> {
  const dungeons = await loadDungeons();

  delete dungeons[dungeonId];

  await saveDungeons(dungeons);
}

export async function findActiveDungeonForPlayer(
  userId: string,
): Promise<DungeonState | undefined> {
  const dungeons = await loadDungeons();

  return Object.values(dungeons).find(
    (state) =>
      state.status !== "completed" &&
      state.status !== "failed" &&
      state.playerIds.includes(userId),
  );
}

export async function getCompletedDungeonForPlayer(
  userId: string,
): Promise<DungeonState | undefined> {
  const dungeons = await loadDungeons();

  return Object.values(dungeons)
    .reverse()
    .find(
      (state) =>
        state.status === "completed" &&
        state.playerIds.includes(userId) &&
        state.members.some(
          (member) =>
            member.userId === userId &&
            !member.rewardClaimed,
        ),
    );
}
