"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var selfHealCallback_exports = {};
__export(selfHealCallback_exports, {
  createSelfHealerCallback: () => createSelfHealerCallback
});
module.exports = __toCommonJS(selfHealCallback_exports);
var import_path = __toESM(require("path"));
var import_system_usage = require("../ai/system-usage");
var import_load_manager = require("../core/load-manager");
var import_tool_permissions = require("../security/tool-permissions");
var import_tools = require("./tools");
function extractRepairJSON(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("Self-Healer returned invalid JSON.");
    }
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }
  if (!parsed || typeof parsed !== "object" || parsed.action !== "write_file" || typeof parsed.path !== "string" || typeof parsed.content !== "string") {
    throw new Error("Self-Healer returned an invalid repair action.");
  }
  return parsed;
}
function createSelfHealerCallback(router, conversation, systemUsage) {
  return async (filePath, errorOutput) => {
    console.log(`\u{1F9E0} AshenAI is diagnosing: ${filePath}`);
    const priority = (0, import_system_usage.getPriorityForSystem)("self-healer");
    if (!(0, import_load_manager.canRunInternalOperation)(priority)) {
      console.log("\u23F8\uFE0F Self-healer deferred: system load too high.");
      return false;
    }
    const estimatedCredits = (0, import_system_usage.estimateSystemCredits)("self-heal");
    if (systemUsage) {
      const check = systemUsage.canExecute("self-healer", priority, estimatedCredits);
      if (!check.allowed) {
        console.log(`\u23F8\uFE0F Self-healer deferred: ${check.reason}`);
        return false;
      }
      systemUsage.acquire("self-healer");
    }
    try {
      const currentContent = await (0, import_tools.readFile)(filePath);
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
${errorOutput.slice(0, 3e4)}

CURRENT FILE CONTENT:
---BEGIN FILE---
${currentContent}
---END FILE---

You are performing a SAFE TARGETED REPAIR.

Rules:
1. Diagnose the actual error.
2. Use the CURRENT FILE CONTENT above.
3. Repair ONLY the affected problem.
4. Do NOT rewrite unrelated functionality.
5. Do NOT modify unrelated files.
6. Preserve existing functionality.
7. Return exactly ONE JSON object.
8. The action MUST be write_file.
9. The path MUST be exactly the supplied FILE.
10. The content MUST be the COMPLETE corrected file.
11. Keep the repair as small as possible.
12. Do not use markdown fences.

Return ONLY:
{
  "action": "write_file",
  "path": "${filePath}",
  "content": "COMPLETE CORRECTED FILE CONTENT"
}`
          }
        ],
        temperature: 0.1,
        maxTokens: 4096
      };
      const response = await router.generate(repairRequest);
      if (systemUsage) {
        systemUsage.record({
          system: "self-healer",
          operation: "repair",
          provider: response.provider,
          credits: estimatedCredits,
          latencyMs: response.latencyMs,
          success: true
        });
      }
      console.log(
        `\u{1F9FE} Self-Healer response received (${response.text.length} chars)`
      );
      let action;
      try {
        action = extractRepairJSON(response.text);
      } catch (error) {
        console.log(
          "\u274C Self-Healer received invalid repair JSON:",
          error instanceof Error ? error.message : String(error)
        );
        return false;
      }
      if (import_path.default.resolve(action.path) !== import_path.default.resolve(filePath)) {
        console.log(
          "\u{1F6E1}\uFE0F Self-Healer rejected repair targeting another file."
        );
        return false;
      }
      if (!(0, import_tool_permissions.canUseTool)("writeFile", "fix")) {
        console.log(
          "\u{1F6E1}\uFE0F Self-Healer write permission denied.",
          (0, import_tool_permissions.getToolDeniedMessage)()
        );
        return false;
      }
      if (!(0, import_tool_permissions.canWritePath)(action.path, "fix")) {
        console.log(
          "\u{1F6E1}\uFE0F Self-Healer write path denied.",
          (0, import_tool_permissions.getToolDeniedMessage)()
        );
        return false;
      }
      console.log(`\u{1F6E0}\uFE0F Applying AI repair to ${filePath}`);
      await (0, import_tools.writeFile)(action.path, action.content);
      console.log("\u{1F9EA} Verifying AI repair...");
      const verification = await (0, import_tools.typecheck)();
      if (/error TS\d+/i.test(verification) || /error:/i.test(verification)) {
        console.log(
          "\u274C AI repair failed TypeScript verification."
        );
        return false;
      }
      console.log(
        "\u2705 AI repair passed TypeScript verification."
      );
      return true;
    } catch (error) {
      if (systemUsage) {
        systemUsage.record({
          system: "self-healer",
          operation: "repair",
          credits: estimatedCredits,
          success: false
        });
      }
      console.log(
        "\u274C Self-Healer repair error:",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    } finally {
      if (systemUsage) {
        systemUsage.release("self-healer");
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSelfHealerCallback
});
