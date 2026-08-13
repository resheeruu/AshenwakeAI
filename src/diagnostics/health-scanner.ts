import fs from "fs";
import path from "path";

export type HealthLevel = "ok" | "warning" | "error";

export interface HealthFinding {
  level: HealthLevel;
  area: string;
  message: string;
}

export interface HealthReport {
  startedAt: number;
  durationMs: number;
  filesScanned: number;
  findings: HealthFinding[];
}

const ROOT = process.cwd();

const IMPORTANT_FILES = [
  "package.json",
  "tsconfig.json",
  ".env",
  "src/index.ts",
  "src/ai/router.ts",
  "src/ai/memory.ts",
  "src/commands/ask.ts",
  "src/commands/handler.ts",
  "src/commands/register.ts",
];

function exists(relativePath: string): boolean {
  return fs.existsSync(
    path.join(ROOT, relativePath),
  );
}

function collectTypeScriptFiles(
  directory: string,
  result: string[] = [],
): string[] {
  if (!fs.existsSync(directory)) {
    return result;
  }

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist"
    ) {
      continue;
    }

    const fullPath = path.join(
      directory,
      entry.name,
    );

    if (entry.isDirectory()) {
      collectTypeScriptFiles(fullPath, result);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts")
    ) {
      result.push(fullPath);
    }
  }

  return result;
}

export function scanAshenAI(): HealthReport {
  const startedAt = Date.now();
  const findings: HealthFinding[] = [];

  for (const file of IMPORTANT_FILES) {
    if (!exists(file)) {
      findings.push({
        level:
          file === ".env"
            ? "warning"
            : "error",
        area: "Files",
        message: `Missing ${file}`,
      });
    }
  }

  if (exists("package.json")) {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(
          path.join(ROOT, "package.json"),
          "utf8",
        ),
      );

      if (!packageJson.scripts?.typecheck) {
        findings.push({
          level: "warning",
          area: "Build",
          message:
            "No npm typecheck script is configured.",
        });
      }

      if (!packageJson.scripts?.test) {
        findings.push({
          level: "warning",
          area: "Tests",
          message:
            "No npm test script is configured.",
        });
      }
    } catch {
      findings.push({
        level: "error",
        area: "Build",
        message:
          "package.json could not be parsed.",
      });
    }
  }

  const tsFiles = collectTypeScriptFiles(
    path.join(ROOT, "src"),
  );

  for (const file of tsFiles) {
    try {
      const content = fs.readFileSync(
        file,
        "utf8",
      );

      if (content.includes("console.log(")) {
        findings.push({
          level: "ok",
          area: "Logging",
          message:
            `${path.relative(ROOT, file)} contains runtime logging.`,
        });
      }

      if (
        content.includes("process.env.") &&
        !content.includes("dotenv")
      ) {
        findings.push({
          level: "warning",
          area: "Configuration",
          message:
            `${path.relative(ROOT, file)} reads environment variables.`,
        });
      }
    } catch (error) {
      findings.push({
        level: "error",
        area: "Files",
        message:
          `Could not read ${path.relative(ROOT, file)}: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
      });
    }
  }

  if (
    exists("src/ai/router.ts") &&
    exists("src/commands/ask.ts")
  ) {
    findings.push({
      level: "ok",
      area: "AI",
      message:
        "AI router and /ask command are present.",
    });
  }

  if (
    exists("src/commands/handler.ts") &&
    exists("src/commands/register.ts")
  ) {
    findings.push({
      level: "ok",
      area: "Discord",
      message:
        "Command handler and command registration are present.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      level: "ok",
      area: "System",
      message:
        "No structural problems were detected.",
    });
  }

  return {
    startedAt,
    durationMs: Date.now() - startedAt,
    filesScanned: tsFiles.length,
    findings,
  };
}
