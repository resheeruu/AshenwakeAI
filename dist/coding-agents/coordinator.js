"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var coordinator_exports = {};
__export(coordinator_exports, {
  CodingAgentCoordinator: () => CodingAgentCoordinator
});
module.exports = __toCommonJS(coordinator_exports);
var import_node_child_process = require("node:child_process");
var import_handoff = require("./handoff");
class CodingAgentCoordinator {
  constructor(registry) {
    this.registry = registry;
  }
  registry;
  async getAvailableAgents() {
    return this.registry.getAvailable();
  }
  async selectAgent(preferredRole) {
    const available = await this.registry.getAvailable();
    if (available.length === 0) {
      throw new Error(
        "No coding agents are currently available."
      );
    }
    if (preferredRole) {
      const matching = available.find(
        (agent) => agent.role === preferredRole
      );
      if (matching) {
        return matching;
      }
    }
    const primary = available.find(
      (agent) => agent.role === "primary"
    );
    if (primary) {
      return primary;
    }
    const fallback = available.find(
      (agent) => agent.role === "fallback"
    );
    return fallback ?? available[0];
  }
  async execute(task, options = {}) {
    const agent = await this.selectAgent();
    const prompt = options.prompt ?? this.buildPrompt(task);
    return this.executeWithAgent(
      agent,
      prompt,
      options.timeoutMs ?? 3e5
    );
  }
  async executeWithAgent(agent, prompt, timeoutMs = 3e5) {
    const startedAt = Date.now();
    return new Promise(
      (resolve, reject) => {
        const executionMode = agent.executionMode ?? "stdin";
        const executionArgs = executionMode === "prompt_arg" ? ["-p", prompt] : executionMode === "print_arg" ? ["--print", prompt] : executionMode === "text_arg" ? [prompt] : [];
        const child = (0, import_node_child_process.spawn)(
          agent.command,
          executionArgs,
          {
            cwd: process.cwd(),
            stdio: [
              "pipe",
              "pipe",
              "pipe"
            ]
          }
        );
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (callback) => {
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
                `Coding agent timed out after ${timeoutMs}ms.`
              )
            );
          });
        }, timeoutMs);
        child.stdout.on(
          "data",
          (chunk) => {
            stdout += String(chunk);
            if (stdout.length > 10 * 1024 * 1024) {
              child.kill("SIGTERM");
              finish(() => {
                reject(
                  new Error(
                    "Coding agent output exceeded the 10MB limit."
                  )
                );
              });
            }
          }
        );
        child.stderr.on(
          "data",
          (chunk) => {
            stderr += String(chunk);
            if (stderr.length > 10 * 1024 * 1024) {
              child.kill("SIGTERM");
              finish(() => {
                reject(
                  new Error(
                    "Coding agent error output exceeded the 10MB limit."
                  )
                );
              });
            }
          }
        );
        child.once(
          "error",
          (error) => {
            finish(() => {
              reject(error);
            });
          }
        );
        child.once(
          "exit",
          (code) => {
            finish(() => {
              const output = `${stdout}${stderr}`.trim();
              const providerFailurePatterns = [
                /\b503\b/i,
                /UNAVAILABLE/i,
                /_ApiError/i,
                /resource exhausted/i,
                /rate limit/i,
                /quota exceeded/i,
                /temporarily unavailable/i,
                /high demand/i
              ];
              const providerFailure = providerFailurePatterns.some(
                (pattern) => pattern.test(output)
              );
              resolve({
                agent: agent.name,
                output,
                exitCode: typeof code === "number" && code !== 0 ? code : providerFailure ? 1 : 0,
                durationMs: Date.now() - startedAt
              });
            });
          }
        );
        if (executionMode === "stdin") {
          child.stdin.write(prompt);
        }
        child.stdin.end();
      }
    );
  }
  async handoff(task, fromAgent, reason, progress, remainingWork) {
    const available = await this.registry.getAvailable();
    const nextAgent = available.find(
      (agent) => agent.name !== fromAgent && agent.role === "fallback"
    ) ?? available.find(
      (agent) => agent.name !== fromAgent
    );
    if (!nextAgent) {
      throw new Error(
        "No alternate coding agent is available for handoff."
      );
    }
    const handoff = {
      taskId: task.id,
      fromAgent,
      toAgent: nextAgent.name,
      reason,
      progress,
      remainingWork,
      timestamp: Date.now()
    };
    await (0, import_handoff.recordHandoff)(handoff);
    return handoff;
  }
  async resumeFromHandoff(task) {
    return (0, import_handoff.getLatestHandoff)(task.id);
  }
  async executeWithFailover(task, prompt, timeoutMs = 3e5) {
    const firstAgent = await this.selectAgent();
    try {
      const result = await this.executeWithAgent(
        firstAgent,
        prompt,
        timeoutMs
      );
      if (result.exitCode === 0) {
        return result;
      }
      const reason = result.output.toLowerCase().includes("timeout") ? "timeout" : "failed";
      const handoff = await this.handoff(
        task,
        firstAgent.name,
        reason,
        `Agent ${firstAgent.name} exited with code ${result.exitCode}.`,
        [
          "Review the previous agent output.",
          "Continue the requested coding work.",
          "Run verification before finishing."
        ]
      );
      const nextAgent = this.registry.get(handoff.toAgent);
      if (!nextAgent) {
        throw new Error(
          `Handoff target "${handoff.toAgent}" is no longer registered.`
        );
      }
      return this.executeWithAgent(
        nextAgent,
        `${prompt}

PERSISTENT HANDOFF:
Previous agent: ${handoff.fromAgent}
Reason: ${handoff.reason}
Progress: ${handoff.progress}
Remaining work:
` + handoff.remainingWork.map((item) => `- ${item}`).join("\n"),
        timeoutMs
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = /timeout/i.test(message) ? "timeout" : /unavailable/i.test(message) ? "unavailable" : "crashed";
      try {
        const handoff = await this.handoff(
          task,
          firstAgent.name,
          reason,
          `Agent ${firstAgent.name} failed: ${message}`,
          [
            "Continue the coding task from the persistent handoff.",
            "Inspect the current project state before editing.",
            "Run verification before finishing."
          ]
        );
        const nextAgent = this.registry.get(handoff.toAgent);
        if (!nextAgent) {
          throw new Error(
            `Handoff target "${handoff.toAgent}" is no longer registered.`
          );
        }
        return this.executeWithAgent(
          nextAgent,
          `${prompt}

PERSISTENT HANDOFF:
Previous agent: ${handoff.fromAgent}
Reason: ${handoff.reason}
Progress: ${handoff.progress}
Remaining work:
` + handoff.remainingWork.map((item) => `- ${item}`).join("\n"),
          timeoutMs
        );
      } catch (handoffError) {
        throw new Error(
          `Coding-agent execution failed: ${message}; handoff failed: ${handoffError instanceof Error ? handoffError.message : String(handoffError)}`
        );
      }
    }
  }
  buildPrompt(task) {
    const completed = task.steps.filter(
      (step) => step.status === "completed"
    ).map(
      (step) => `- ${step.title}: ${step.result ?? "completed"}`
    ).join("\n") || "None";
    const remaining = task.steps.filter(
      (step) => step.status === "pending" || step.status === "failed"
    ).map(
      (step) => `- ${step.title}: ${step.description}`
    ).join("\n") || "None";
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
      "- Report exactly what changed and what remains."
    ].join("\n");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CodingAgentCoordinator
});
