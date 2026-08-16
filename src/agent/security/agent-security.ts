import path from "path";

const BLOCKED_PATHS = [
  ".env",
  ".env.local",
  ".env.production",
  "node_modules",
  ".git",
  "data/agent-logs",
  "data/agent-backups",
];

const BLOCKED_ACTIONS = [
  "delete_project",
  "delete_repository",
  "remove_security",
  "disable_logging",
  "modify_agent_security",
  "read_credentials",
  "read_env",
];

export function isProtectedPath(filePath: string): boolean {
  const normalized = path
    .normalize(filePath)
    .replace(/\\/g, "/");

  return BLOCKED_PATHS.some(
    (blocked) =>
      normalized === blocked ||
      normalized.startsWith(`${blocked}/`) ||
      normalized.endsWith(`/${blocked}`),
  );
}

export function isActionBlocked(action: string): boolean {
  return BLOCKED_ACTIONS.includes(action);
}

export function assertSafeAction(
  action: string,
  filePath?: string,
): void {
  if (isActionBlocked(action)) {
    throw new Error(
      `SECURITY BLOCK: action "${action}" is not permitted.`,
    );
  }

  if (filePath && isProtectedPath(filePath)) {
    throw new Error(
      `SECURITY BLOCK: protected path "${filePath}" cannot be modified.`,
    );
  }
}

export function getAgentSecurityPolicy() {
  return {
    protectedPaths: [...BLOCKED_PATHS],
    blockedActions: [...BLOCKED_ACTIONS],
    failClosed: true,
  };
}
