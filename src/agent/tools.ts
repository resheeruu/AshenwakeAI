import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { isSecretPath } from "../security/tool-permissions";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = process.cwd();

/* =========================================================
   INTERNAL EXECUTOR
   ========================================================= */

async function exec(
  command: string,
  args: string[] = [],
  timeout = 120_000,
): Promise<string> {
  const { stdout, stderr } =
    await execFileAsync(
      command,
      args,
      {
        cwd: PROJECT_ROOT,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

  return `${stdout}${stderr}`.trim();
}

/* =========================================================
   FILE PATH SAFETY
   ========================================================= */

function safePath(
  filePath: string,
): string {
  const requestedPath = String(
    filePath ?? "",
  ).trim();

  if (!requestedPath) {
    throw new Error(
      "File path is empty.",
    );
  }

  if (isSecretPath(requestedPath)) {
    throw new Error(
      "Access to private configuration and secret files is blocked.",
    );
  }

  const root =
    path.resolve(PROJECT_ROOT);

  const full =
    path.resolve(
      PROJECT_ROOT,
      requestedPath,
    );

  if (
    full !== root &&
    !full.startsWith(
      root + path.sep,
    )
  ) {
    throw new Error(
      "Path outside project is blocked.",
    );
  }

  const relative =
    path.relative(root, full)
      .replace(/\\/g, "/");

  if (isSecretPath(relative)) {
    throw new Error(
      "Access to private configuration and secret files is blocked.",
    );
  }

  return full;
}

/* =========================================================
   READ FILE
   ========================================================= */

export async function readFile(
  filePath: string,
): Promise<string> {
  return fs.promises.readFile(
    safePath(filePath),
    "utf8",
  );
}

/* =========================================================
   WRITE FILE
   ========================================================= */

export async function writeFile(
  filePath: string,
  content: string,
): Promise<string> {
  const fullPath =
    safePath(filePath);

  await fs.promises.mkdir(
    path.dirname(fullPath),
    {
      recursive: true,
    },
  );

  /*
   * Create a backup BEFORE modifying an existing file.
   * Never overwrite the backup until the current file has
   * been safely copied.
   */
  if (fs.existsSync(fullPath)) {
    const backupPath = `${fullPath}.agent-backup`;

    await fs.promises.copyFile(
      fullPath,
      backupPath,
    );
  }

  await fs.promises.writeFile(
    fullPath,
    content,
    "utf8",
  );

  return `✅ File written: ${filePath}`;
}

/* =========================================================
   DEPENDENCY CHECK
   ========================================================= */

export async function checkDependencies(): Promise<string> {
  const packageJson =
    await readFile("package.json");

  const pkg =
    JSON.parse(packageJson);

  const dependencies = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  const results: string[] = [];

  for (
    const name of Object.keys(
      dependencies,
    )
  ) {
    try {
      const output =
        await exec(
          "npm",
          [
            "list",
            name,
            "--depth=0",
            "--json",
          ],
          30_000,
        );

      const data =
        JSON.parse(output);

      const installed =
        data?.dependencies?.[name]
          ?.version;

      if (installed) {
        results.push(
          `✅ ${name}: installed (${installed})`,
        );
      } else {
        results.push(
          `❌ ${name}: missing`,
        );
      }
    } catch {
      results.push(
        `❌ ${name}: missing`,
      );
    }
  }

  return results.join("\n");
}

/* =========================================================
   TYPESCRIPT
   ========================================================= */

export async function typecheck(): Promise<string> {
  try {
    return await exec(
      "npm",
      ["run", "typecheck"],
      120_000,
    );
  } catch (error: any) {
    return `${error?.stdout ?? ""}${error?.stderr ?? ""}`.trim();
  }
}

/* =========================================================
   RUN TESTS
   ========================================================= */

export async function runTests(): Promise<string> {
  try {
    return await exec(
      "npm",
      ["test"],
      180_000,
    );
  } catch (error: any) {
    return `${error?.stdout ?? ""}${error?.stderr ?? ""}`.trim();
  }
}

/* =========================================================
   CHECK PROJECT
   ========================================================= */

export async function checkProject(): Promise<string> {
  const results: string[] = [];

  results.push(
    "=== PROJECT CHECK ===",
  );

  results.push(
    "\n=== PROJECT STATUS ===",
  );

  results.push(
    await projectStatus(),
  );

  results.push(
    "\n=== DEPENDENCIES ===",
  );

  results.push(
    await checkDependencies(),
  );

  results.push(
    "\n=== TYPESCRIPT ===",
  );

  results.push(
    await typecheck(),
  );

  return results.join("\n");
}

/* =========================================================
   PROVIDER TEST
   ========================================================= */

export async function testProviders(): Promise<string> {
  return [
    "=== PROVIDER TEST ===",
    "Provider testing is handled by the AI router.",
    "Use the configured provider router for live provider checks.",
  ].join("\n");
}

/* =========================================================
   PROJECT STATUS
   ========================================================= */

export async function projectStatus(): Promise<string> {
  const results: string[] = [];

  results.push(
    "=== PROJECT STATUS ===",
  );

  results.push(
    `Project: ${PROJECT_ROOT}`,
  );

  results.push(
    `package.json: ${
      fs.existsSync(
        path.join(
          PROJECT_ROOT,
          "package.json",
        ),
      )
        ? "present"
        : "missing"
    }`,
  );

  results.push(
    `src/: ${
      fs.existsSync(
        path.join(
          PROJECT_ROOT,
          "src",
        ),
      )
        ? "present"
        : "missing"
    }`,
  );

  try {
    await exec(
      "git",
      [
        "rev-parse",
        "--is-inside-work-tree",
      ],
      10_000,
    );

    results.push(
      "Git: repository initialized",
    );
  } catch {
    results.push(
      "Git: not a git repository",
    );
  }

  return results.join("\n");
}

/* =========================================================
   SEARCH PROJECT
   ========================================================= */

export async function searchProject(
  query: string,
): Promise<string> {
  if (!query.trim()) {
    throw new Error(
      "Search query is empty.",
    );
  }

  try {
    return await exec(
      "grep",
      [
        "-RIn",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        query,
        ".",
      ],
      30_000,
    );
  } catch (error: any) {
    return (
      error?.stdout ||
      "No matches found."
    );
  }
}

/* =========================================================
   GIT DIFF
   ========================================================= */

export async function gitDiff(): Promise<string> {
  try {
    return await exec(
      "git",
      [
        "diff",
        "--stat",
      ],
      10_000,
    );
  } catch {
    return "Git repository not initialized.";
  }
}

/* =========================================================
   SAFE PACKAGE INSTALL
   ========================================================= */

export async function installPackage(
  packageName: string,
  dev = false,
): Promise<string> {
  if (
    !/^[a-zA-Z0-9@/_\-.]+$/.test(
      packageName,
    )
  ) {
    throw new Error(
      "Invalid package name.",
    );
  }

  const packageJson = JSON.parse(
    await readFile("package.json"),
  );

  const declaredInDependencies =
    Boolean(packageJson.dependencies?.[packageName]);

  const declaredInDevDependencies =
    Boolean(packageJson.devDependencies?.[packageName]);

  const declared =
    declaredInDependencies ||
    declaredInDevDependencies;

  if (declared) {
    try {
      const installed = await exec(
        "npm",
        [
          "ls",
          packageName,
          "--depth=0",
          "--json",
        ],
        30_000,
      );

      const data = JSON.parse(installed);
      const version =
        data?.dependencies?.[packageName]?.version;

      if (version) {
        return [
          `ℹ️ Package already installed: ${packageName}@${version}`,
          `No installation needed.`,
        ].join("\n");
      }
    } catch {
      // Declared but not installed correctly.
      // Continue with npm install below.
    }
  }

  const args = [
    "install",
    packageName,
  ];

  if (dev) {
    args.push("--save-dev");
  }

  return exec(
    "npm",
    args,
    180_000,
  );
}

/* =========================================================
   SAFE COMMAND
   ========================================================= */

export async function runCommand(
  command: string | string[],
): Promise<string> {
  const parts =
    Array.isArray(command)
      ? command
      : command.trim().split(/\s+/);

  if (
    parts.length === 0 ||
    !parts[0]
  ) {
    throw new Error(
      "Command is empty.",
    );
  }

  /*
   * Safe command boundary.
   *
   * These commands are intentionally limited to diagnostics and
   * project verification. Arbitrary shell execution is blocked.
   */
  const allowedCommands =
    new Set([
      "npm",
      "npx",
      "node",
      "git",
      "grep",
      "find",
      "ls",
      "pwd",
    ]);

  if (
    !allowedCommands.has(
      parts[0],
    )
  ) {
    throw new Error(
      `Command not allowed: ${parts[0]}`,
    );
  }

  /*
   * Block shell metacharacters and command chaining.
   * The executor uses execFile, but rejecting these explicitly
   * keeps the policy clear and prevents accidental shell-like
   * command construction.
   */
  const forbiddenTokens = [
    ";",
    "&&",
    "||",
    "|",
    ">",
    ">>",
    "<",
    "$(",
    "`",
  ];

  if (
    parts.some((part) =>
      forbiddenTokens.some((token) =>
        part.includes(token),
      ),
    )
  ) {
    throw new Error(
      "Unsafe shell syntax is not allowed.",
    );
  }

  return exec(
    parts[0],
    parts.slice(1),
  );
}

/* =========================================================
   DIAGNOSIS
   ========================================================= */

export async function diagnoseProject(): Promise<string> {
  const results: string[] = [];

  results.push(
    "=== PROJECT DIAGNOSIS ===",
  );

  results.push(
    await projectStatus(),
  );

  results.push(
    "\n=== DEPENDENCIES ===",
  );

  results.push(
    await checkDependencies(),
  );

  results.push(
    "\n=== TYPESCRIPT ===",
  );

  results.push(
    await typecheck(),
  );

  return results.join("\n");
}
