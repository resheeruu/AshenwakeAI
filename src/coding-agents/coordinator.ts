import { spawn } from "node:child_process";
import { AgentTask } from "../agent/tasks/types";
import { AgentHandoff, CodingAgentRole } from "./types";
import { CodingAgentRegistry } from "./registry";
import { recordHandoff, getLatestHandoff } from "./handoff";

export interface CodingAgentExecutionResult {
  agent: string;
  output: string;
  exitCode: number;
  durationMs: number;
}

export interface CodingAgentExecutionOptions {
  timeoutMs?: number;
  prompt?: string;
}

export class CodingAgentCoordinator {
  constructor(
    private readonly registry: CodingAgentRegistry,
  ) {}

  async getAvailableAgents() {
    return this.registry.getAvailable();
  }

  async selectAgent(
    preferredRole?: CodingAgentRole | string,
  ) {
    const available =
      await this.registry.getAvailable();

    if (available.length === 0) {
      throw new Error(
        "No coding agents are currently available.",
      );
    }

    if (preferredRole) {
      const matching =
        available.find(
          agent => agent.role === preferredRole,
        );

      if (matching) {
        return matching;
      }
    }

    const primary =
      available.find(
        agent => agent.role === "primary",
      );

    if (primary) {
      return primary;
    }

    const fallback =
      available.find(
        agent => agent.role === "fallback",
      );

    return fallback ?? available[0];
  }

  async execute(
    task: AgentTask,
    options: CodingAgentExecutionOptions = {},
  ): Promise<CodingAgentExecutionResult> {
    const agent = await this.selectAgent();

    const prompt =
      options.prompt ??
      this.buildPrompt(task);

    return this.executeWithAgent(
      agent,
      prompt,
      options.timeoutMs ?? 300_000,
    );
  }

  async executeWithAgent(
    agent: {
      readonly name: string;
      readonly command: string;
    },
    prompt: string,
    timeoutMs = 300_000,
  ): Promise<CodingAgentExecutionResult> {
    const startedAt = Date.now();

    return new Promise(
      (resolve, reject) => {
        const child = spawn(
          agent.command,
          [],
          {
            cwd: process.cwd(),
            stdio: [
              "pipe",
              "pipe",
              "pipe",
            ],
          },
        );

        let stdout = "";
        let stderr = "";
        let settled = false;

        const finish = (
          callback: () => void,
        ) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timer);
          callback();
        };

        const timer = setTimeout(() => {
          finish(() => {
            child.kill("SIGTERM");

            reject(
              new Error(
                `Coding agent timed out after ${timeoutMs}ms.`,
              ),
            );
          });
        }, timeoutMs);

        child.stdout.on(
          "data",
          chunk => {
            stdout += String(chunk);

            if (stdout.length > 10 * 1024 * 1024) {
              child.kill("SIGTERM");

              finish(() => {
                reject(
                  new Error(
                    "Coding agent output exceeded the 10MB limit.",
                  ),
                );
              });
            }
          },
        );

        child.stderr.on(
          "data",
          chunk => {
            stderr += String(chunk);

            if (stderr.length > 10 * 1024 * 1024) {
              child.kill("SIGTERM");

              finish(() => {
                reject(
                  new Error(
                    "Coding agent error output exceeded the 10MB limit.",
                  ),
                );
              });
            }
          },
        );

        child.once(
          "error",
          error => {
            finish(() => {
              reject(error);
            });
          },
        );

        child.once(
          "exit",
          code => {
            finish(() => {
              resolve({
                agent: agent.name,
                output:
                  `${stdout}${stderr}`.trim(),
                exitCode:
                  typeof code === "number"
                    ? code
                    : 1,
                durationMs:
                  Date.now() - startedAt,
              });
            });
          },
        );

        child.stdin.write(prompt);
        child.stdin.end();
      },
    );
  }

  async handoff(
    task: AgentTask,
    fromAgent: string,
    reason: AgentHandoff["reason"],
    progress: string,
    remainingWork: string[],
  ): Promise<AgentHandoff> {
    const available =
      await this.registry.getAvailable();

    const nextAgent =
      available.find(
        agent =>
          agent.name !== fromAgent &&
          agent.role === "fallback",
      ) ??
      available.find(
        agent => agent.name !== fromAgent,
      );

    if (!nextAgent) {
      throw new Error(
        "No alternate coding agent is available for handoff.",
      );
    }

    const handoff: AgentHandoff = {
      taskId: task.id,
      fromAgent,
      toAgent: nextAgent.name,
      reason,
      progress,
      remainingWork,
      timestamp: Date.now(),
    };

    await recordHandoff(handoff);

    return handoff;
  }

  async resumeFromHandoff(
    task: AgentTask,
  ): Promise<AgentHandoff | undefined> {
    return getLatestHandoff(task.id);
  }

  async executeWithFailover(
    task: AgentTask,
    prompt: string,
    timeoutMs = 300_000,
  ): Promise<CodingAgentExecutionResult> {
    const firstAgent = await this.selectAgent();

    try {
      const result = await this.executeWithAgent(
        firstAgent,
        prompt,
        timeoutMs,
      );

      if (result.exitCode === 0) {
        return result;
      }

      const reason: AgentHandoff["reason"] =
        result.output.toLowerCase().includes("timeout")
          ? "timeout"
          : "failed";

      const handoff = await this.handoff(
        task,
        firstAgent.name,
        reason,
        `Agent ${firstAgent.name} exited with code ${result.exitCode}.`,
        [
          "Review the previous agent output.",
          "Continue the requested coding work.",
          "Run verification before finishing.",
        ],
      );

      const nextAgent = this.registry.get(handoff.toAgent);

      if (!nextAgent) {
        throw new Error(
          `Handoff target "${handoff.toAgent}" is no longer registered.`,
        );
      }

      return this.executeWithAgent(
        nextAgent,
        `${prompt}\n\nPERSISTENT HANDOFF:\n` +
          `Previous agent: ${handoff.fromAgent}\n` +
          `Reason: ${handoff.reason}\n` +
          `Progress: ${handoff.progress}\n` +
          `Remaining work:\n` +
          handoff.remainingWork.map(item => `- ${item}`).join("\n"),
        timeoutMs,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const reason: AgentHandoff["reason"] =
        /timeout/i.test(message)
          ? "timeout"
          : /unavailable/i.test(message)
            ? "unavailable"
            : "crashed";

      try {
        const handoff = await this.handoff(
          task,
          firstAgent.name,
          reason,
          `Agent ${firstAgent.name} failed: ${message}`,
          [
            "Continue the coding task from the persistent handoff.",
            "Inspect the current project state before editing.",
            "Run verification before finishing.",
          ],
        );

        const nextAgent = this.registry.get(handoff.toAgent);

        if (!nextAgent) {
          throw new Error(
            `Handoff target "${handoff.toAgent}" is no longer registered.`,
          );
        }

        return this.executeWithAgent(
          nextAgent,
          `${prompt}\n\nPERSISTENT HANDOFF:\n` +
            `Previous agent: ${handoff.fromAgent}\n` +
            `Reason: ${handoff.reason}\n` +
            `Progress: ${handoff.progress}\n` +
            `Remaining work:\n` +
            handoff.remainingWork.map(item => `- ${item}`).join("\n"),
          timeoutMs,
        );
      } catch (handoffError) {
        throw new Error(
          `Coding-agent execution failed: ${message}; ` +
          `handoff failed: ${
            handoffError instanceof Error
              ? handoffError.message
              : String(handoffError)
          }`,
        );
      }
    }
  }

  private buildPrompt(
    task: AgentTask,
  ): string {
    const completed =
      task.steps
        .filter(
          step => step.status === "completed",
        )
        .map(
          step =>
            `- ${step.title}: ${step.result ?? "completed"}`,
        )
        .join("\n") ||
      "None";

    const remaining =
      task.steps
        .filter(
          step =>
            step.status === "pending" ||
            step.status === "failed",
        )
        .map(
          step =>
            `- ${step.title}: ${step.description}`,
        )
        .join("\n") ||
      "None";

    return [
      "You are a coding worker for AshenAI.",
      "",
      `Task ID: ${task.id}`,
      `Goal: ${task.goal}`,
      "",
      "Completed work:",
      completed,
      "",
      "Remaining work:",
      remaining,
      "",
      "Rules:",
      "- Inspect the existing implementation before changing it.",
      "- Preserve the existing architecture.",
      "- Make small, focused changes.",
      "- Do not expose secrets or credentials.",
      "- Do not modify unrelated files.",
      "- Run appropriate verification before finishing.",
      "- Report exactly what changed and what remains.",
    ].join("\n");
  }
}
