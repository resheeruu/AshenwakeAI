import path from "path";
import { AIRouter } from "../ai/router";
import { providers } from "../ai/providers";
import { AIRequest, ChatMessage } from "../ai/types";
import {
  canUseTool,
  canWritePath,
  getToolDeniedMessage,
} from "../security/tool-permissions";
import { readFile, writeFile, typecheck } from "./tools";

type RepairAction = {
  action: "write_file";
  path: string;
  content: string;
};

function extractRepairJSON(text: string): RepairAction {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;

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

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { action?: unknown }).action !== "write_file" ||
    typeof (parsed as { path?: unknown }).path !== "string" ||
    typeof (parsed as { content?: unknown }).content !== "string"
  ) {
    throw new Error("Self-Healer returned an invalid repair action.");
  }

  return parsed as RepairAction;
}

export function createSelfHealerCallback(
  router: AIRouter,
  conversation: ChatMessage[],
): (
  filePath: string,
  errorOutput: string,
) => Promise<boolean> {
  return async (filePath, errorOutput): Promise<boolean> => {
    console.log(`🧠 AshenAI is diagnosing: ${filePath}`);

    const currentContent = await readFile(filePath);

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
${errorOutput.slice(0, 30000)}

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
}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 4096,
    };

    try {
      const response = await router.generate(repairRequest);

      console.log(
        `🧾 Self-Healer response received (${response.text.length} chars)`,
      );

      let action: RepairAction;

      try {
        action = extractRepairJSON(response.text);
      } catch (error) {
        console.log(
          "❌ Self-Healer received invalid repair JSON:",
          error instanceof Error ? error.message : String(error),
        );
        return false;
      }

      if (path.resolve(action.path) !== path.resolve(filePath)) {
        console.log(
          "🛡️ Self-Healer rejected repair targeting another file.",
        );
        return false;
      }

      /*
       * Automatic repairs still pass through the normal security
       * authorization layer. We explicitly use the FIX permission
       * profile here rather than changing the global agent mode.
       */
      if (!canUseTool("writeFile", "fix")) {
        console.log(
          "🛡️ Self-Healer write permission denied.",
          getToolDeniedMessage(),
        );
        return false;
      }

      if (!canWritePath(action.path, "fix")) {
        console.log(
          "🛡️ Self-Healer write path denied.",
          getToolDeniedMessage(),
        );
        return false;
      }

      console.log(`🛠️ Applying AI repair to ${filePath}`);

      await writeFile(action.path, action.content);

      console.log("🧪 Verifying AI repair...");

      const verification = await typecheck();

      if (
        /error TS\d+/i.test(verification) ||
        /error:/i.test(verification) ||
        /failed/i.test(verification)
      ) {
        console.log(
          "❌ AI repair failed TypeScript verification.",
        );
        return false;
      }

      console.log(
        "✅ AI repair passed TypeScript verification.",
      );

      return true;
    } catch (error) {
      console.log(
        "❌ Self-Healer repair error:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  };
}
