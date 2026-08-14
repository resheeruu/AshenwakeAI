/**
 * AshenAI Tool Permission Boundary
 *
 * Public Discord users must NEVER receive privileged project tools.
 * Only the autonomous agent or explicitly authorized administrators
 * may use tools that can inspect or modify the project.
 */

export type ToolAccess =
  | "public"
  | "agent"
  | "admin";

const SECRET_PATH_PATTERNS = [
  /^\.env(?:\..*)?$/i,
  /(^|\/)\.env(?:\..*)?$/i,
  /(^|\/)(?:secrets?|credentials?|private|tokens?)(?:\/|$)/i,
  /(?:api[_-]?key|access[_-]?token|bot[_-]?token|password|private[_-]?key)/i,
];

const PRIVILEGED_TOOLS = new Set([
  "readFile",
  "writeFile",
  "searchProject",
  "gitDiff",
  "installPackage",
  "runCommand",
  "checkDependencies",
  "typecheck",
  "runTests",
  "checkProject",
  "diagnoseProject",
]);

const AGENT_TOOLS = new Set([
  "gitDiff",
  "checkDependencies",
  "typecheck",
  "runTests",
  "checkProject",
  "diagnoseProject",
]);

export function isSecretPath(filePath: string): boolean {
  const normalized = String(filePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  return SECRET_PATH_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

export function canUseTool(
  toolName: string,
  access: ToolAccess,
): boolean {
  if (!PRIVILEGED_TOOLS.has(toolName)) {
    return access === "public" ||
      access === "agent" ||
      access === "admin";
  }

  if (access === "admin") {
    return true;
  }

  if (access === "agent") {
    return AGENT_TOOLS.has(toolName);
  }

  return false;
}

export function canReadPath(
  filePath: string,
  access: ToolAccess,
): boolean {
  if (isSecretPath(filePath)) {
    return false;
  }

  if (access === "admin" || access === "agent") {
    return true;
  }

  return false;
}

export function canWritePath(
  filePath: string,
  access: ToolAccess,
): boolean {
  if (isSecretPath(filePath)) {
    return false;
  }

  return access === "agent" || access === "admin";
}

export function getToolDeniedMessage(): string {
  return "I don't have access to internal project tools or private files.";
}
