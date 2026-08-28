/**
 * AshenAI Tool Permission Boundary
 *
 * Public Discord users must NEVER receive privileged project tools.
 * Only the autonomous agent or explicitly authorized administrators
 * may use tools that can inspect or modify the project.
 */

import path from "node:path";

export type ToolAccess =
  | "public"
  | "agent"
  | "fix"
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

/*
 * FIX mode gets the minimum additional permissions required to repair
 * the project. Secret paths remain blocked by canReadPath/canWritePath.
 */
const FIX_TOOLS = new Set([
  ...AGENT_TOOLS,
  "readFile",
  "writeFile",
  "searchProject",
  "runCommand",
  "installPackage",
]);

/**
 * Normalizes a file path to prevent traversal attacks.
 * Resolves "..", removes redundant separators, and strips leading slashes.
 * Returns null for absolute paths (outside project root).
 */
function normalizePath(filePath: string): string | null {
  const raw = String(filePath ?? "").replace(/\\/g, "/");

  // Block absolute paths
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
    return null;
  }

  // Decode percent-encoded traversal sequences
  let decoded = raw;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // If decoding fails, use the raw value
  }

  // Block null bytes
  if (decoded.includes("\0")) {
    return null;
  }

  // Normalize: collapse double slashes, resolve ".."
  const normalized = path.posix.normalize(decoded);

  // After normalization, reject absolute paths again
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }

  // Block remaining ".." after normalization
  if (normalized.includes("..")) {
    return null;
  }

  // Strip leading "./"
  return normalized.replace(/^\.\//, "");
}

export function isSecretPath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (normalized === null) return true; // Treat un-normalizable paths as secret

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

  if (access === "fix") {
    return FIX_TOOLS.has(toolName);
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

  if (
    access === "admin" ||
    access === "agent" ||
    access === "fix"
  ) {
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

  return (
    access === "agent" ||
    access === "fix" ||
    access === "admin"
  );
}

export function getToolDeniedMessage(): string {
  return "I don't have access to internal project tools or private files.";
}
