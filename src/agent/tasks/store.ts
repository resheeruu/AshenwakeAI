import fs from "fs";
import path from "path";
import { AgentTask } from "./types";

const ROOT = process.cwd();
const TASK_DIR = path.join(ROOT, "data");
const TASK_FILE = path.join(TASK_DIR, "agent-tasks.json");

async function ensureStore(): Promise<void> {
  await fs.promises.mkdir(TASK_DIR, {
    recursive: true,
  });

  if (!fs.existsSync(TASK_FILE)) {
    await fs.promises.writeFile(
      TASK_FILE,
      "[]",
      "utf8",
    );
  }
}

export async function loadTasks(): Promise<AgentTask[]> {
  await ensureStore();

  try {
    const raw =
      await fs.promises.readFile(
        TASK_FILE,
        "utf8",
      );

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export async function saveTasks(
  tasks: AgentTask[],
): Promise<void> {
  await ensureStore();

  const temporary =
    `${TASK_FILE}.tmp`;

  await fs.promises.writeFile(
    temporary,
    JSON.stringify(tasks, null, 2),
    "utf8",
  );

  await fs.promises.rename(
    temporary,
    TASK_FILE,
  );
}

export async function getTask(
  taskId: string,
): Promise<AgentTask | undefined> {
  const tasks = await loadTasks();

  return tasks.find(
    task => task.id === taskId,
  );
}

export async function upsertTask(
  task: AgentTask,
): Promise<void> {
  const tasks = await loadTasks();

  const index = tasks.findIndex(
    item => item.id === task.id,
  );

  if (index === -1) {
    tasks.push(task);
  } else {
    tasks[index] = task;
  }

  await saveTasks(tasks);
}

export async function deleteTask(
  taskId: string,
): Promise<boolean> {
  const tasks = await loadTasks();

  const filtered =
    tasks.filter(
      task => task.id !== taskId,
    );

  if (filtered.length === tasks.length) {
    return false;
  }

  await saveTasks(filtered);

  return true;
}
