import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CodingAgent, CodingAgentExecutionMode, CodingAgentRole } from "../types";

const execFileAsync = promisify(execFile);

const COMMAND_ALLOWLIST = new Set([
  "claude", "aider", "opencode", "codex",
  "cursor", "continue", "gptme", "sweep",
  "swe-agent", "devon", "mentat",
]);

function sanitizeCommandName(command: string): string {
  return command.replace(/[^a-zA-Z0-9._-]/g, "");
}

export class CliCodingAgent implements CodingAgent {
  constructor(
    public readonly name: string,
    public readonly command: string,
    public readonly version: string,
    public readonly role: CodingAgentRole,
    public readonly executionMode: CodingAgentExecutionMode = "stdin",
  ) {}

  async isAvailable(): Promise<boolean> {
    const safeCommand = sanitizeCommandName(this.command);
    if (!COMMAND_ALLOWLIST.has(safeCommand) && !COMMAND_ALLOWLIST.has(this.command)) {
      return false;
    }

    try {
      await execFileAsync("command", ["-v", this.command], {
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }
}
