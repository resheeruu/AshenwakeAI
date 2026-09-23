"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_path = __toESM(require("path"));
var import_config = require("dotenv/config");
var import_readline = __toESM(require("readline"));
var import_router = require("../ai/router");
var import_providers = require("../ai/providers");
var import_prompt = require("./prompt");
var import_context = require("../security/context");
var import_tool_permissions = require("../security/tool-permissions");
var import_tools = require("./tools");
var import_selfHeal = require("./selfHeal");
var import_tasks = require("./tasks");
var import_aiPlanner = require("./tasks/aiPlanner");
const verboseLogs = process.env.ASHENAI_VERBOSE_LOGS === "1" || process.env.ASHENAI_VERBOSE_LOGS === "true";
const agentLog = (...args) => {
  if (verboseLogs) console.log(...args);
};
const importantLog = (...args) => {
  console.log(...args);
};
const router = new import_router.AIRouter(import_providers.providers, {
  persistentHealth: true
});
let agentMode = "CHECK";
const conversation = [
  {
    role: "system",
    content: import_prompt.AGENT_SYSTEM_PROMPT + `

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

`
  }
];
function detectMode(input) {
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
    "update"
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
    "find error"
  ];
  if (fixWords.some(
    (word) => value.includes(word)
  )) {
    return "fix";
  }
  if (checkWords.some(
    (word) => value.includes(word)
  )) {
    return "check";
  }
  return "normal";
}
function extractJSON(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(
        cleaned.slice(start, end + 1)
      );
    }
    throw new Error(
      "Agent returned invalid JSON."
    );
  }
}
function isMutatingAction(action) {
  return action.action === "write_file" || action.action === "run_command" || action.action === "install_dependency";
}
function isVerificationAction(action) {
  return action.action === "typecheck" || action.action === "run_tests" || action.action === "check_project";
}
async function executeAction(action) {
  const toolNameMap = {
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
    finish: "finish"
  };
  const toolName = toolNameMap[action.action];
  const toolAccess = agentMode === "FIX" ? "fix" : "agent";
  if (!(0, import_tool_permissions.canUseTool)(toolName, toolAccess)) {
    throw new Error((0, import_tool_permissions.getToolDeniedMessage)());
  }
  if (action.action === "read_file" && !(0, import_tool_permissions.canReadPath)(action.path, toolAccess)) {
    throw new Error((0, import_tool_permissions.getToolDeniedMessage)());
  }
  if (action.action === "write_file" && !(0, import_tool_permissions.canWritePath)(action.path, toolAccess)) {
    throw new Error((0, import_tool_permissions.getToolDeniedMessage)());
  }
  switch (action.action) {
    case "read_file":
      return await (0, import_tools.readFile)(action.path);
    case "search_project":
      return await (0, import_tools.searchProject)(
        action.pattern
      );
    case "write_file":
      return await (0, import_tools.writeFile)(
        action.path,
        action.content
      );
    case "run_command":
      return await (0, import_tools.runCommand)(
        action.command
      );
    case "project_status":
      return await (0, import_tools.projectStatus)();
    case "typecheck":
      return await (0, import_tools.typecheck)();
    case "run_tests":
      return await (0, import_tools.runTests)();
    case "check_project":
      return await (0, import_tools.checkProject)();
    case "check_dependencies":
      return await (0, import_tools.checkDependencies)();
    case "diagnose_project":
      return await (0, import_tools.diagnoseProject)();
    case "test_providers":
      return await (0, import_tools.testProviders)();
    case "install_dependency":
      if (agentMode !== "FIX") {
        throw new Error(
          "install_dependency is only allowed in FIX mode."
        );
      }
      return await (0, import_tools.installPackage)(
        action.packageName,
        action.dev ?? false
      );
    case "finish":
      return action.message;
    default:
      throw new Error(
        "Unknown agent action."
      );
  }
}
async function askAgent(userMessage) {
  const mode = detectMode(userMessage);
  agentMode = mode === "fix" ? "FIX" : "CHECK";
  console.log(
    `
\u{1F9ED} Agent mode: ${mode.toUpperCase()}`
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
`
  });
  let verificationPassed = false;
  let repairAttempts = 0;
  const verificationRequested = mode === "check" && /\b(verify|verification|typecheck|type-check|tests?|test suite)\b/i.test(
    userMessage
  );
  if (verificationRequested) {
    try {
      console.log("\\n\u{1F52C} Deterministic verification requested.");
      console.log("\\n\u{1F6E0}\uFE0F Verification: typecheck");
      const typecheckResult = await executeAction({
        action: "typecheck"
      });
      console.log(
        `   \u2713 Tool completed (${typecheckResult.length} chars)`
      );
      const typecheckFailed = /EXIT:\\s*[1-9]/.test(typecheckResult) || /error TS\d+/i.test(typecheckResult) || /FAILED/i.test(typecheckResult);
      if (typecheckFailed) {
        console.log("   \u274C Typecheck failed.");
        verificationPassed = false;
      } else {
        console.log("   \u2705 Typecheck passed");
        console.log("\\n\u{1F6E0}\uFE0F Verification: run_tests");
        const testResult = await executeAction({
          action: "run_tests"
        });
        console.log(
          `   \u2713 Tool completed (${testResult.length} chars)`
        );
        const testsFailed = /EXIT:\\s*[1-9]/.test(testResult) || /(?:FAILED|Failed):\\s*[1-9]/i.test(testResult);
        verificationPassed = !testsFailed;
        console.log(
          verificationPassed ? "   \u2705 Tests passed" : "   \u274C Tests failed"
        );
      }
    } catch (error) {
      verificationPassed = false;
      console.log(
        `   \u274C Verification error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (verificationRequested && verificationPassed) {
    console.log("\n\u2705 Deterministic verification passed.");
    console.log("\u{1F916} Project verification complete.");
    return;
  }
  const maxSteps = mode === "check" ? 12 : mode === "fix" ? 18 : 14;
  for (let step = 1; step <= maxSteps; step++) {
    const request = {
      messages: conversation,
      temperature: 0.1,
      maxTokens: 4096
    };
    let response;
    try {
      response = await router.generate(request);
    } catch (error) {
      console.log(
        `
\u274C AI generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      conversation.push({
        role: "user",
        content: "AI generation failed. Choose another safe action."
      });
      continue;
    }
    conversation.push({
      role: "assistant",
      content: response.text
    });
    let action;
    try {
      action = extractJSON(
        response.text
      );
    } catch {
      console.log(
        "\n\u26A0\uFE0F Invalid agent action. Retrying...\n"
      );
      conversation.push({
        role: "user",
        content: "INVALID ACTION. Return exactly one valid JSON action from the allowed action schema."
      });
      continue;
    }
    console.log(
      `
\u{1F6E0}\uFE0F Step ${step}: ${action.action}`
    );
    if (mode === "check" && isMutatingAction(action)) {
      console.log(
        "   \u{1F6E1}\uFE0F BLOCKED: CHECK mode is read-only."
      );
      conversation.push({
        role: "user",
        content: "BLOCKED ACTION: This is CHECK mode. You cannot modify files, install packages, or execute arbitrary commands. Use project_status, check_dependencies, diagnose_project, typecheck, run_tests, read_file, search_project, or test_providers."
      });
      continue;
    }
    if (action.action === "write_file") {
      repairAttempts++;
      if (repairAttempts > 3) {
        console.log(
          "   \u{1F6E1}\uFE0F Repair limit reached."
        );
        conversation.push({
          role: "user",
          content: "REPAIR LIMIT REACHED. Stop modifying files. Verify the current state and report what remains."
        });
        continue;
      }
    }
    if (action.action === "finish") {
      if (!verificationPassed) {
        console.log(
          "   \u{1F6E1}\uFE0F BLOCKED: Cannot finish before verification passes."
        );
        conversation.push({
          role: "user",
          content: "Verification has NOT passed. Do not claim the project is healthy. Run typecheck/tests or another appropriate verification tool and only finish after it succeeds."
        });
        continue;
      }
      console.log(
        `
\u{1F916} ${action.message}
`
      );
      return;
    }
    try {
      const result = await executeAction(action);
      console.log(
        `   \u2713 Tool completed (${result.length} chars)`
      );
      if (isVerificationAction(action)) {
        const failed = /EXIT:\s*[1-9]/.test(result) || /error TS\d+/i.test(result) || /FAILED/i.test(result);
        verificationPassed = !failed;
        console.log(
          verificationPassed ? "   \u2705 Verification passed" : "   \u274C Verification failed"
        );
      }
      conversation.push({
        role: "user",
        content: (0, import_context.wrapUntrustedContent)(
          "TOOL RESULT",
          `${result.slice(0, 3e4)}

Remember:
- Do not invent facts.
- Do not repeat completed checks.
- If verification failed, diagnose the actual failure.
- If verification succeeded, use that evidence.
- Never claim health without verification.`
        )
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `   \u274C Tool failed: ${message}`
      );
      conversation.push({
        role: "user",
        content: (0, import_context.wrapUntrustedContent)(
          "TOOL ERROR",
          `${message}

Diagnose the actual error and choose the next safe action.`
        )
      });
    }
  }
  console.log(
    `
\u26A0\uFE0F Agent stopped after ${maxSteps} steps.`
  );
  if (!verificationPassed) {
    console.log(
      "\u26A0\uFE0F Project health was NOT verified."
    );
  }
}
async function main() {
  (0, import_selfHeal.startSelfHealer)(async (filePath, errorOutput) => {
    console.log(`\u{1F9E0} AshenAI is diagnosing: ${filePath}`);
    const repairRequest = {
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
${await (0, import_tools.readFile)(filePath)}
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

Do not use markdown fences.`
        }
      ],
      temperature: 0.1,
      maxTokens: 4096
    };
    try {
      const response = await router.generate(repairRequest);
      agentLog("");
      agentLog("\u{1F9FE} ===== SELF-HEALER AI RESPONSE =====");
      if (verboseLogs) {
        console.log(response.text.slice(0, 4e3));
        if (response.text.length > 4e3) {
          console.log(`\u2026 truncated ${response.text.length - 4e3} characters`);
        }
      } else {
        console.log(`\u{1F9FE} Self-Healer response received (${response.text.length} chars)`);
      }
      agentLog("\u{1F9FE} ===== END SELF-HEALER RESPONSE =====");
      agentLog("");
      let action;
      try {
        action = extractJSON(response.text);
      } catch {
        console.log("\u274C Self-Healer received invalid repair JSON.");
        return false;
      }
      if (action.action !== "write_file") {
        console.log("\u{1F6E1}\uFE0F Self-Healer rejected unsafe repair action.");
        return false;
      }
      if (import_path.default.resolve(action.path) !== import_path.default.resolve(filePath)) {
        console.log("\u{1F6E1}\uFE0F Self-Healer rejected repair targeting another file.");
        return false;
      }
      console.log(`\u{1F6E0}\uFE0F Applying AI repair to ${filePath}`);
      await executeAction(action);
      console.log("\u{1F9EA} Verifying AI repair...");
      const verification = await (0, import_tools.typecheck)();
      if (/error TS\d+/i.test(verification) || /error:/i.test(verification) || /failed/i.test(verification)) {
        console.log("\u274C AI repair failed TypeScript verification.");
        return false;
      }
      console.log("\u2705 AI repair passed TypeScript verification.");
      return true;
    } catch (error) {
      console.log(
        "\u274C Self-Healer repair error:",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  });
  const cliArgs = process.argv.slice(2);
  if (cliArgs[0] === "task") {
    (0, import_tasks.initializeTaskEngine)();
    const operation = cliArgs[1];
    try {
      if (operation === "add") {
        const goal = cliArgs.slice(2).join(" ").trim();
        if (!goal) {
          console.log('Usage: task add "your goal"');
          process.exit(1);
        }
        console.log(`\u{1F9E0} Planning task: ${goal}`);
        const planned = await (0, import_aiPlanner.planTask)(router, goal);
        const task = await import_tasks.taskEngine.create(
          planned.goal,
          planned.steps.map((step) => ({
            title: step.title,
            description: step.description,
            action: step.action,
            maxAttempts: step.maxAttempts
          }))
        );
        console.log(`\u{1F4BE} Task saved: ${task.id}`);
        console.log("");
        console.log("\u2705 Task created");
        console.log(`\u{1F194} ${task.id}`);
        console.log(`\u{1F3AF} ${task.goal}`);
        console.log(`\u{1F4CA} ${task.steps.length} steps`);
        console.log("");
        console.log(`Run:    npx tsx src/agent/index.ts task run ${task.id}`);
        console.log(`Status: npx tsx src/agent/index.ts task status ${task.id}`);
        console.log(`Cancel: npx tsx src/agent/index.ts task cancel ${task.id}`);
        process.exit(0);
      }
      if (operation === "list") {
        const tasks = await import_tasks.taskEngine.list();
        if (tasks.length === 0) {
          console.log("\u{1F4ED} No tasks.");
          process.exit(0);
        }
        console.log("\u{1F916} AshenAI Tasks");
        console.log("");
        for (const task of tasks.slice(-20).reverse()) {
          console.log(
            `${task.status === "completed" ? "\u2705" : task.status === "cancelled" ? "\u{1F6D1}" : task.status === "failed" ? "\u274C" : task.status === "running" ? "\u{1F504}" : "\u23F3"} ${task.id} \u2014 ${task.status} \u2014 ${task.goal}`
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
        const task = await import_tasks.taskEngine.get(id);
        if (!task) {
          console.log(`\u274C Task not found: ${id}`);
          process.exit(1);
        }
        console.log("\u{1F916} Task Status");
        console.log(`\u{1F194} ${task.id}`);
        console.log(`\u{1F4CC} ${task.status}`);
        console.log(`\u{1F3AF} ${task.goal}`);
        console.log("");
        task.steps.forEach((step, index) => {
          const icon = step.status === "completed" ? "\u2705" : step.status === "failed" ? "\u274C" : step.status === "running" ? "\u{1F504}" : step.status === "skipped" ? "\u23ED\uFE0F" : "\u23F3";
          console.log(`${icon} ${index + 1}. ${step.title}`);
        });
        if (task.error) {
          console.log("");
          console.log(`\u274C ${task.error}`);
        }
        process.exit(0);
      }
      if (operation === "run") {
        const id = cliArgs[2]?.trim();
        if (!id) {
          console.log("Usage: task run <task-id>");
          process.exit(1);
        }
        const task = await import_tasks.taskEngine.get(id);
        if (!task) {
          console.log(`\u274C Task not found: ${id}`);
          process.exit(1);
        }
        console.log(`\u{1F680} Running task ${task.id}`);
        console.log(`\u{1F3AF} ${task.goal}`);
        console.log("");
        const result = await import_tasks.taskEngine.run(task.id);
        console.log("");
        console.log(
          result.status === "completed" ? "\u2705 TASK COMPLETED" : `\u26A0\uFE0F TASK ${result.status.toUpperCase()}`
        );
        console.log(`\u{1F194} ${result.id}`);
        process.exit(result.status === "completed" ? 0 : 1);
      }
      if (operation === "cancel") {
        const id = cliArgs[2]?.trim();
        if (!id) {
          console.log("Usage: task cancel <task-id>");
          process.exit(1);
        }
        const result = await import_tasks.taskEngine.cancel(id);
        console.log(`\u{1F6D1} Task ${result.id} is now ${result.status}.`);
        process.exit(0);
      }
      console.log(
        "Usage: task <add|list|status|run|cancel> [arguments]"
      );
      process.exit(1);
    } catch (error) {
      console.error(
        "\u274C Task CLI error:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  }
  console.log("");
  console.log(
    "\u{1F525} AshenAI \u2014 Living Agent V2"
  );
  console.log("");
  console.log(
    "\u{1F9E0} Interactive development agent"
  );
  console.log(
    "\u{1F50E} CHECK mode is read-only"
  );
  console.log(
    "\u{1F527} FIX mode can repair files"
  );
  console.log(
    "\u{1F9EA} Verification required after repairs"
  );
  console.log(
    "\u{1F4BE} File changes receive automatic backups"
  );
  console.log(
    "\u{1FA79} Self-Healer watches your source code"
  );
  console.log(
    "\u{1F6E1}\uFE0F Dangerous operations are blocked"
  );
  console.log("");
  console.log(
    "Type 'exit' to quit."
  );
  console.log("");
  const rl = import_readline.default.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You: "
  });
  rl.prompt();
  rl.on(
    "line",
    async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }
      if (input.toLowerCase() === "exit") {
        rl.close();
        return;
      }
      try {
        await askAgent(input);
      } catch (error) {
        console.error(
          "\u274C Agent error:",
          error instanceof Error ? error.message : String(error)
        );
      }
      rl.prompt();
    }
  );
  rl.on(
    "close",
    () => {
      console.log(
        "\n\u{1F44B} AshenAI agent stopped."
      );
      process.exit(0);
    }
  );
}
void main();
