import path from "path";
import "dotenv/config";
import readline from "readline";

import { AIRouter } from "../ai/router";
import { providers } from "../ai/providers";
import {
  AIRequest,
  ChatMessage,
} from "../ai/types";

import { AGENT_SYSTEM_PROMPT } from "./prompt";
import { wrapUntrustedContent } from "../security/context";
import {
  canUseTool,
  canReadPath,
  canWritePath,
  getToolDeniedMessage,
} from "../security/tool-permissions";

import {
  readFile,
  searchProject,
  writeFile,
  runCommand,
  projectStatus,
  typecheck,
  runTests,
  checkProject,
  testProviders,
  checkDependencies,
  diagnoseProject,
  installPackage,
} from "./tools";

import { startSelfHealer } from "./selfHeal";
import {
  taskEngine,
  initializeTaskEngine,
} from "./tasks";
import { planTask } from "./tasks/aiPlanner";

// ─────────────────────────────────────────────────────────────
// AshenAI logging policy
//
// Normal mode:
//   Important verification/repair results remain visible.
//   Internal agent diagnostics are suppressed.
//
// Verbose mode:
//   ASHENAI_VERBOSE_LOGS=1
//   Shows detailed agent diagnostics.
//
// Module-scoped so every agent function, including Self-Healer,
// can safely use agentLog.
// ─────────────────────────────────────────────────────────────
const verboseLogs =
  process.env.ASHENAI_VERBOSE_LOGS === "1" ||
  process.env.ASHENAI_VERBOSE_LOGS === "true";

const agentLog = (...args: unknown[]): void => {
  if (verboseLogs) console.log(...args);
};

const importantLog = (...args: unknown[]): void => {
  console.log(...args);
};



const router = new AIRouter(providers, {
  persistentHealth: true,
});

let agentMode: "CHECK" | "FIX" = "CHECK";

const conversation: ChatMessage[] = [
  {
    role: "system",
    content:
      AGENT_SYSTEM_PROMPT +
      `

LIVING AGENT V2 RULES:

1. Never claim the project is healthy unless verification actually succeeded.

2. CHECK requests are READ-ONLY.

3. Never use write_file during CHECK mode.

4. Never use run_command during CHECK mode.

5. Prefer dedicated diagnostic tools over arbitrary shell commands.

6. Do not repeatedly inspect the same file unless new evidence requires it.

7. Do not randomly explore AI providers while diagnosing the project.

8. For FIX requests, identify the exact problem before changing files.

9. Before modifying a file, use write_file so the automatic backup is created.

10. After every modification, run typecheck.

11. After typecheck succeeds, run the test suite.

12. If verification fails, inspect the actual failure and attempt a targeted repair.

13. Never install packages unless a missing dependency is actually confirmed.

14. Never modify package versions just because a command failed.

15. Maximum repair attempts per problem: 3.

16. If verification cannot be completed, explicitly say verification is incomplete.

17. Do not invent tool results.

18. Return exactly ONE JSON action at a time.

19. Do not claim that Self-Healer repaired something unless verification succeeded.

20. Prefer minimal targeted changes over rewriting unrelated code.

`,
  },
];

type AgentMode =
  | "check"
  | "fix"
  | "normal";

type AgentAction =
  | {
      action: "read_file";
      path: string;
    }
  | {
      action: "search_project";
      pattern: string;
    }
  | {
      action: "write_file";
      path: string;
      content: string;
    }
  | {
      action: "run_command";
      command: string[];
    }
  | {
      action: "project_status";
    }
  | {
      action: "typecheck";
    }
  | {
      action: "run_tests";
    }
  | {
      action: "check_project";
    }
  | {
      action: "check_dependencies";
    }
  | {
      action: "diagnose_project";
    }
  | {
      action: "test_providers";
    }
  | {
      action: "install_dependency";
      packageName: string;
      dev?: boolean;
    }
  | {
      action: "finish";
      message: string;
      verified?: boolean;
    };

function detectMode(input: string): AgentMode {
  const value = input.toLowerCase();

  const fixWords = [
    "fix",
    "repair",
    "correct",
    "solve",
    "auto fix",
    "autofix",
    "automatically fix",
    "make it work",
    "implement",
    "change",
    "update",
  ];

  const checkWords = [
    "check",
    "diagnose",
    "inspect",
    "status",
    "test",
    "verify",
    "health",
    "what is wrong",
    "find error",
  ];

  if (
    fixWords.some((word) =>
      value.includes(word),
    )
  ) {
    return "fix";
  }

  if (
    checkWords.some((word) =>
      value.includes(word),
    )
  ) {
    return "check";
  }

  return "normal";
}

function extractJSON(
  text: string,
): AgentAction {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(
        cleaned.slice(start, end + 1),
      );
    }

    throw new Error(
      "Agent returned invalid JSON.",
    );
  }
}

function isMutatingAction(
  action: AgentAction,
): boolean {
  return (
    action.action === "write_file" ||
    action.action === "run_command" ||
    action.action === "install_dependency"
  );
}

function isVerificationAction(
  action: AgentAction,
): boolean {
  return (
    action.action === "typecheck" ||
    action.action === "run_tests" ||
    action.action === "check_project"
  );
}

async function executeAction(
  action: AgentAction,
): Promise<string> {
  /*
   * SECURITY BOUNDARY
   *
   * This is the final authorization check immediately before
   * an agent action reaches the actual tool implementation.
   */
  const toolNameMap: Record<AgentAction["action"], string> = {
    read_file: "readFile",
    search_project: "searchProject",
    write_file: "writeFile",
    run_command: "runCommand",
    project_status: "projectStatus",
    typecheck: "typecheck",
    run_tests: "runTests",
    check_project: "checkProject",
    check_dependencies: "checkDependencies",
    diagnose_project: "diagnoseProject",
    test_providers: "testProviders",
    install_dependency: "installPackage",
    finish: "finish",
  };

  const toolName = toolNameMap[action.action];

  /*
   * CHECK mode gets the read/verification-only agent permission set.
   * FIX mode gets the narrowly expanded repair permission set.
   */
  const toolAccess =
    agentMode === "FIX"
      ? "fix"
      : "agent";

  if (!canUseTool(toolName, toolAccess)) {
    throw new Error(getToolDeniedMessage());
  }

  if (
    action.action === "read_file" &&
    !canReadPath(action.path, toolAccess)
  ) {
    throw new Error(getToolDeniedMessage());
  }

  if (
    action.action === "write_file" &&
    !canWritePath(action.path, toolAccess)
  ) {
    throw new Error(getToolDeniedMessage());
  }

  switch (action.action) {
    case "read_file":
      return await readFile(action.path);

    case "search_project":
      return await searchProject(
        action.pattern,
      );

    case "write_file":
      return await writeFile(
        action.path,
        action.content,
      );

    case "run_command":
      return await runCommand(
        action.command,
      );

    case "project_status":
      return await projectStatus();

    case "typecheck":
      return await typecheck();

    case "run_tests":
      return await runTests();

    case "check_project":
      return await checkProject();

    case "check_dependencies":
      return await checkDependencies();

    case "diagnose_project":
      return await diagnoseProject();

    case "test_providers":
      return await testProviders();

    case "install_dependency":
      if (agentMode !== "FIX") {
        throw new Error(
          "install_dependency is only allowed in FIX mode.",
        );
      }

      return await installPackage(
        action.packageName,
        action.dev ?? false,
      );

    case "finish":
      return action.message;

    default:
      throw new Error(
        "Unknown agent action.",
      );
  }
}

async function askAgent(
  userMessage: string,
): Promise<void> {
  const mode = detectMode(userMessage);

  agentMode =
    mode === "fix"
      ? "FIX"
      : "CHECK";

  console.log(
    `\n🧭 Agent mode: ${mode.toUpperCase()}`,
  );

  conversation.push({
    role: "user",
    content: `
USER REQUEST:
${userMessage}

CURRENT MODE:
${mode}

Follow the LIVING AGENT V2 RULES.

Return exactly ONE JSON action.
`,
  });

  let verificationPassed = false;
  let repairAttempts = 0;

  /*
   * DETERMINISTIC CHECK VERIFICATION.
   *
   * When the user explicitly requests typecheck/tests,
   * CHECK mode performs those dedicated verification tools
   * directly instead of relying on the AI to select them.
   */
  
  // ─────────────────────────────────────────────────────────────
  const verificationRequested =
    mode === "check" &&
    /\b(verify|verification|typecheck|type-check|tests?|test suite)\b/i.test(
      userMessage,
    );

  if (verificationRequested) {
    try {
      console.log("\\n🔬 Deterministic verification requested.");

      console.log("\\n🛠️ Verification: typecheck");
      const typecheckResult = await executeAction({
        action: "typecheck",
      });
      console.log(
        `   ✓ Tool completed (${typecheckResult.length} chars)`,
      );

      const typecheckFailed =
        /EXIT:\\s*[1-9]/.test(typecheckResult) ||
        /error TS\d+/i.test(typecheckResult) ||
        /FAILED/i.test(typecheckResult);

      if (typecheckFailed) {
        console.log("   ❌ Typecheck failed.");
        verificationPassed = false;
      } else {
        console.log("   ✅ Typecheck passed");

        console.log("\\n🛠️ Verification: run_tests");
        const testResult = await executeAction({
          action: "run_tests",
        });
        console.log(
          `   ✓ Tool completed (${testResult.length} chars)`,
        );

        const testsFailed =
          /EXIT:\\s*[1-9]/.test(testResult) ||
          /(?:FAILED|Failed):\\s*[1-9]/i.test(testResult);

        verificationPassed = !testsFailed;

        console.log(
          verificationPassed
            ? "   ✅ Tests passed"
            : "   ❌ Tests failed",
        );
      }
    } catch (error) {
      verificationPassed = false;
      console.log(
        `   ❌ Verification error: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  /*
   * DETERMINISTIC VERIFICATION COMPLETE.
   *
   * If the user explicitly requested verification and both
   * typecheck + tests passed, do not send the result back
   * through the AI decision loop. The verification itself
   * is authoritative.
   */
  if (verificationRequested && verificationPassed) {
    console.log("\n✅ Deterministic verification passed.");
    console.log("🤖 Project verification complete.");
    return;
  }

  const maxSteps =
    mode === "check"
      ? 12
      : mode === "fix"
        ? 18
        : 14;

  for (
    let step = 1;
    step <= maxSteps;
    step++
  ) {
    const request: AIRequest = {
      messages: conversation,
      temperature: 0.1,
      maxTokens: 4096,
    };

    let response;

    try {
      response =
        await router.generate(request);
    } catch (error) {
      console.log(
        `\n❌ AI generation failed: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );

      conversation.push({
        role: "user",
        content:
          "AI generation failed. Choose another safe action.",
      });

      continue;
    }

    conversation.push({
      role: "assistant",
      content: response.text,
    });

    let action: AgentAction;

    try {
      action = extractJSON(
        response.text,
      );
    } catch {
      console.log(
        "\n⚠️ Invalid agent action. Retrying...\n",
      );

      conversation.push({
        role: "user",
        content:
          "INVALID ACTION. Return exactly one valid JSON action from the allowed action schema.",
      });

      continue;
    }

    console.log(
      `\n🛠️ Step ${step}: ${action.action}`,
    );

    /*
     * CHECK MODE IS STRICTLY READ-ONLY.
     */
    if (
      mode === "check" &&
      isMutatingAction(action)
    ) {
      console.log(
        "   🛡️ BLOCKED: CHECK mode is read-only.",
      );

      conversation.push({
        role: "user",
        content:
          "BLOCKED ACTION: This is CHECK mode. You cannot modify files, install packages, or execute arbitrary commands. Use project_status, check_dependencies, diagnose_project, typecheck, run_tests, read_file, search_project, or test_providers.",
      });

      continue;
    }

    /*
     * LIMIT REPAIR ATTEMPTS.
     */
    if (
      action.action === "write_file"
    ) {
      repairAttempts++;

      if (repairAttempts > 3) {
        console.log(
          "   🛡️ Repair limit reached.",
        );

        conversation.push({
          role: "user",
          content:
            "REPAIR LIMIT REACHED. Stop modifying files. Verify the current state and report what remains.",
        });

        continue;
      }
    }

    /*
     * FINISH.
     *
     * A finish action is only allowed after an actual
     * verification tool has passed. The AI cannot
     * declare the project healthy by itself.
     */
    if (
      action.action === "finish"
    ) {
      if (!verificationPassed) {
        console.log(
          "   🛡️ BLOCKED: Cannot finish before verification passes.",
        );

        conversation.push({
          role: "user",
          content:
            "Verification has NOT passed. Do not claim the project is healthy. Run typecheck/tests or another appropriate verification tool and only finish after it succeeds.",
        });

        continue;
      }

      console.log(
        `\n🤖 ${action.message}\n`,
      );

      return;
    }

    /*
     * EXECUTE TOOL.
     */
    try {
      const result =
        await executeAction(action);

      console.log(
        `   ✓ Tool completed (${result.length} chars)`,
      );

      /*
       * VERIFICATION TRACKING.
       */
      if (
        isVerificationAction(action)
      ) {
        const failed =
          /EXIT:\s*[1-9]/.test(result) ||
          /error TS\d+/i.test(result) ||
          /FAILED/i.test(result);

        verificationPassed =
          !failed;

        console.log(
          verificationPassed
            ? "   ✅ Verification passed"
            : "   ❌ Verification failed",
        );
      }

        conversation.push({
          role: "user",
          content: wrapUntrustedContent(
            "TOOL RESULT",
            `${result.slice(0, 30000)}

Remember:
- Do not invent facts.
- Do not repeat completed checks.
- If verification failed, diagnose the actual failure.
- If verification succeeded, use that evidence.
- Never claim health without verification.`
          ),
        });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.log(
        `   ❌ Tool failed: ${message}`,
      );

        conversation.push({
          role: "user",
          content: wrapUntrustedContent(
            "TOOL ERROR",
            `${message}

Diagnose the actual error and choose the next safe action.`
          ),
        });
    }
  }

  console.log(
    `\n⚠️ Agent stopped after ${maxSteps} steps.`,
  );

  if (!verificationPassed) {
    console.log(
      "⚠️ Project health was NOT verified.",
    );
  }
}

async function main(): Promise<void> {
  /*
   * START AUTOMATIC SELF-HEALER.
   *
   * This runs independently from the interactive agent.
   * It watches src/ and scripts/ for changes.
   */
  startSelfHealer(async (filePath, errorOutput) => {
    console.log(`🧠 AshenAI is diagnosing: ${filePath}`);

    const repairRequest: AIRequest = {
      messages: [
        ...conversation,
        {
          role: "user",
          content: `SELF-HEAL REQUEST

A source file was changed and verification failed.

FILE:
${filePath}

VERIFICATION ERROR:
${errorOutput}

CURRENT FILE CONTENT:
---BEGIN FILE---
${await readFile(filePath)}
---END FILE---

You are performing a SAFE TARGETED REPAIR.

Rules:
1. Diagnose the actual error.
2. Use the CURRENT FILE CONTENT above.
3. Repair ONLY the affected problem.
4. Do NOT rewrite unrelated functionality.
5. Do NOT return read_file.
6. Do NOT modify unrelated files.
7. Preserve existing functionality.
8. Return exactly ONE JSON object.
9. The action MUST be write_file.
10. The content MUST be the COMPLETE corrected file.
11. Keep the repair as small as possible.

Return ONLY:
{
  "action": "write_file",
  "path": "${filePath}",
  "content": "COMPLETE CORRECTED FILE CONTENT"
}

Do not use markdown fences.`,
        },
      ],
      temperature: 0.1,
      maxTokens: 4096,
    };

    try {
      const response = await router.generate(repairRequest);

      agentLog("");
      agentLog("🧾 ===== SELF-HEALER AI RESPONSE =====");
      if (verboseLogs) {
        console.log(response.text.slice(0, 4000));
        if (response.text.length > 4000) {
          console.log(`… truncated ${response.text.length - 4000} characters`);
        }
      } else {
        console.log(`🧾 Self-Healer response received (${response.text.length} chars)`);
      }
      agentLog("🧾 ===== END SELF-HEALER RESPONSE =====");
      agentLog("");

      let action: AgentAction;

      try {
        action = extractJSON(response.text);
      } catch {
        console.log("❌ Self-Healer received invalid repair JSON.");
        return false;
      }

      if (action.action !== "write_file") {
        console.log("🛡️ Self-Healer rejected unsafe repair action.");
        return false;
      }

      if (path.resolve(action.path) !== path.resolve(filePath)) {
        console.log("🛡️ Self-Healer rejected repair targeting another file.");
        return false;
      }

      console.log(`🛠️ Applying AI repair to ${filePath}`);

      await executeAction(action);

      console.log("🧪 Verifying AI repair...");

      const verification = await typecheck();

      if (
        /error TS\d+/i.test(verification) ||
        /error:/i.test(verification) ||
        /failed/i.test(verification)
      ) {
        console.log("❌ AI repair failed TypeScript verification.");
        return false;
      }

      console.log("✅ AI repair passed TypeScript verification.");
      return true;
    } catch (error) {
      console.log(
        "❌ Self-Healer repair error:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  });


  // ─────────────────────────────────────────────────────────────
  // TERMUX TASK CLI
  // These commands are intentionally outside Discord.
  // ─────────────────────────────────────────────────────────────
  const cliArgs = process.argv.slice(2);

  if (cliArgs[0] === "task") {
    initializeTaskEngine();

    const operation = cliArgs[1];

    try {
      if (operation === "add") {
        const goal = cliArgs.slice(2).join(" ").trim();

        if (!goal) {
          console.log('Usage: task add "your goal"');
          process.exit(1);
        }

        console.log(`🧠 Planning task: ${goal}`);

        const planned = await planTask(router, goal);

        const task = await taskEngine.create(
          planned.goal,
          planned.steps.map((step) => ({
            title: step.title,
            description: step.description,
            action: step.action,
            maxAttempts: step.maxAttempts,
          })),
        );

        console.log(`💾 Task saved: ${task.id}`);

        console.log("");
        console.log("✅ Task created");
        console.log(`🆔 ${task.id}`);
        console.log(`🎯 ${task.goal}`);
        console.log(`📊 ${task.steps.length} steps`);
        console.log("");
        console.log(`Run:    npx tsx src/agent/index.ts task run ${task.id}`);
        console.log(`Status: npx tsx src/agent/index.ts task status ${task.id}`);
        console.log(`Cancel: npx tsx src/agent/index.ts task cancel ${task.id}`);

        process.exit(0);
      }

      if (operation === "list") {
        const tasks = await taskEngine.list();

        if (tasks.length === 0) {
          console.log("📭 No tasks.");
          process.exit(0);
        }

        console.log("🤖 AshenAI Tasks");
        console.log("");

        for (const task of tasks.slice(-20).reverse()) {
          console.log(
            `${task.status === "completed" ? "✅" :
              task.status === "cancelled" ? "🛑" :
              task.status === "failed" ? "❌" :
              task.status === "running" ? "🔄" : "⏳"} ` +
            `${task.id} — ${task.status} — ${task.goal}`,
          );
        }

        process.exit(0);
      }

      if (operation === "status") {
        const id = cliArgs[2]?.trim();

        if (!id) {
          console.log("Usage: task status <task-id>");
          process.exit(1);
        }

        const task = await taskEngine.get(id);

        if (!task) {
          console.log(`❌ Task not found: ${id}`);
          process.exit(1);
        }

        console.log("🤖 Task Status");
        console.log(`🆔 ${task.id}`);
        console.log(`📌 ${task.status}`);
        console.log(`🎯 ${task.goal}`);
        console.log("");

        task.steps.forEach((step, index) => {
          const icon =
            step.status === "completed" ? "✅" :
            step.status === "failed" ? "❌" :
            step.status === "running" ? "🔄" :
            step.status === "skipped" ? "⏭️" : "⏳";

          console.log(`${icon} ${index + 1}. ${step.title}`);
        });

        if (task.error) {
          console.log("");
          console.log(`❌ ${task.error}`);
        }

        process.exit(0);
      }

      if (operation === "run") {
        const id = cliArgs[2]?.trim();

        if (!id) {
          console.log("Usage: task run <task-id>");
          process.exit(1);
        }

        const task = await taskEngine.get(id);

        if (!task) {
          console.log(`❌ Task not found: ${id}`);
          process.exit(1);
        }

        console.log(`🚀 Running task ${task.id}`);
        console.log(`🎯 ${task.goal}`);
        console.log("");

        const result = await taskEngine.run(task.id);

        console.log("");
        console.log(
          result.status === "completed"
            ? "✅ TASK COMPLETED"
            : `⚠️ TASK ${result.status.toUpperCase()}`,
        );
        console.log(`🆔 ${result.id}`);

        process.exit(result.status === "completed" ? 0 : 1);
      }

      if (operation === "cancel") {
        const id = cliArgs[2]?.trim();

        if (!id) {
          console.log("Usage: task cancel <task-id>");
          process.exit(1);
        }

        const result = await taskEngine.cancel(id);

        console.log(`🛑 Task ${result.id} is now ${result.status}.`);

        process.exit(0);
      }

      console.log(
        "Usage: task <add|list|status|run|cancel> [arguments]",
      );
      process.exit(1);
    } catch (error) {
      console.error(
        "❌ Task CLI error:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  console.log("");
  console.log(
    "🔥 AshenAI — Living Agent V2",
  );
  console.log("");
  console.log(
    "🧠 Interactive development agent",
  );
  console.log(
    "🔎 CHECK mode is read-only",
  );
  console.log(
    "🔧 FIX mode can repair files",
  );
  console.log(
    "🧪 Verification required after repairs",
  );
  console.log(
    "💾 File changes receive automatic backups",
  );
  console.log(
    "🩹 Self-Healer watches your source code",
  );
  console.log(
    "🛡️ Dangerous operations are blocked",
  );
  console.log("");
  console.log(
    "Type 'exit' to quit.",
  );
  console.log("");

  const rl =
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "You: ",
    });

  rl.prompt();

  rl.on(
    "line",
    async (line) => {
      const input =
        line.trim();

      if (!input) {
        rl.prompt();
        return;
      }

      if (
        input.toLowerCase() ===
        "exit"
      ) {
        rl.close();
        return;
      }

      try {
        await askAgent(input);
      } catch (error) {
        console.error(
          "❌ Agent error:",
          error instanceof Error
            ? error.message
            : String(error),
        );
      }

      rl.prompt();
    },
  );

  rl.on(
    "close",
    () => {
      console.log(
        "\n👋 AshenAI agent stopped.",
      );
      process.exit(0);
    },
  );
}

void main();
