import fs from "fs";
import path from "path";
import { DungeonState } from "./dungeons";
import { getDataDir, getDataPath, getDungeonPath } from "../config/data-dir";

async function ensureStore(): Promise<void> {
  await fs.promises.mkdir(getDataDir(), { recursive: true });

  if (!fs.existsSync(getDungeonPath())) {
    await fs.promises.writeFile(getDungeonPath(), "{}", "utf8");
  }
}

export async function loadDungeons(): Promise<Record<string, DungeonState>> {
  await ensureStore();

  try {
    const raw = await fs.promises.readFile(getDungeonPath(), "utf8");
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

  const temporary = `${getDungeonPath()}.tmp`;

  await fs.promises.writeFile(
    temporary,
    JSON.stringify(dungeons, null, 2),
    "utf8",
  );

  await fs.promises.rename(temporary, getDungeonPath());
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
