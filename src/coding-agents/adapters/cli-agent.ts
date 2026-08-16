import { spawn } from "node:child_process";
import { CodingAgent, CodingAgentRole } from "../types";

export class CliCodingAgent implements CodingAgent {
  constructor(
    public readonly name: string,
    public readonly command: string,
    public readonly version: string,
    public readonly role: CodingAgentRole,
  ) {}

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(
        "sh",
        ["-c", `command -v "${this.command}"`],
        {
          stdio: "ignore",
        },
      );

      child.once("error", () => resolve(false));

      child.once("exit", (code) => {
        resolve(code === 0);
      });
    });
  }
}
