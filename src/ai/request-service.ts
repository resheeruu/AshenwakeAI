import { AIRouter } from "./router";
import { ConversationMemory } from "./memory";
import { UsageManager } from "./usage-manager";
import { inspectUserInput } from "../security";
import { checkBoundary } from "../security/boundary";
import { ASHENAI_SYSTEM_PROMPT } from "../security/policy";
import { buildGuildInstructionBlock } from "./guild-instructions";
import { guardAIOutput } from "../security/output-guard";
import { stripSecurityLabels } from "../security/context";
import { logger } from "../logger";

export interface AIRequestParams {
  userId: string;
  guildId: string;
  channelId: string;
  prompt: string;
  source: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface AIRequestResult {
  success: boolean;
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  blocked: boolean;
  blockReason?: string;
  boundaryMatched: boolean;
  error?: string;
}

export interface AIRequestDeps {
  router: AIRouter;
  memory: ConversationMemory;
  usageManager: UsageManager;
}

const MAX_RESPONSE_LENGTH = 1900;

function cleanResponse(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) return "I wasn't able to generate a response.";
  if (cleaned.length <= MAX_RESPONSE_LENGTH) return cleaned;
  return cleaned.slice(0, MAX_RESPONSE_LENGTH - 20).trimEnd() + "\n\n…(response shortened)";
}

export function createAIRequestService(deps: AIRequestDeps) {
  const { router, memory, usageManager } = deps;

  return {
    async processRequest(params: AIRequestParams): Promise<AIRequestResult> {
      const { userId, guildId, channelId, prompt, source, systemPrompt, temperature, maxTokens, model } = params;

      const boundary = checkBoundary(prompt);
      if (boundary.matched && boundary.response) {
        return {
          success: true, text: boundary.response, provider: "", model: "",
          latencyMs: 0, blocked: false, boundaryMatched: true,
        };
      }

      const security = inspectUserInput(prompt);
      if (security.decision === "BLOCK") {
        return {
          success: true, text: security.safeResponse || "I can't process that request.",
          provider: "", model: "", latencyMs: 0, blocked: true,
          blockReason: security.classification || "security_policy", boundaryMatched: false,
        };
      }

      const history = memory.get(userId, channelId);
      const messages = [
        {
          role: "system" as const,
          content:
            (systemPrompt || ASHENAI_SYSTEM_PROMPT) +
            buildGuildInstructionBlock(guildId),
        },
        ...history.map(entry => ({ role: entry.role as "user" | "assistant", content: entry.content })),
        { role: "user" as const, content: prompt },
      ];

      const response = await router.generate({
        messages,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 1200,
        guildId,
        userId,
        channelId,
        source,
        ...(model ? { model } : {}),
      });

      if (!response || !response.text || !response.text.trim()) {
        throw new Error("AI router returned an empty response.");
      }

      const guarded = guardAIOutput(response.text);
      if (!guarded.allowed) {
        logger.warn(`🛡️ AI output blocked (${source}): ${guarded.reason ?? "security_policy"}`);
      }

      const reply = cleanResponse(stripSecurityLabels(guarded.text));

      memory.addBatch(userId, { role: "user", content: prompt }, channelId);
      memory.addBatch(userId, { role: "assistant", content: guarded.text }, channelId);

      return {
        success: true,
        text: reply,
        provider: response.provider,
        model: response.model,
        latencyMs: response.latencyMs,
        blocked: false,
        boundaryMatched: false,
      };
    },

    flush(): void {
      memory.flushBatch();
      usageManager.flush();
    },

    recordUsage(params: {
      userId: string;
      guildId: string;
      feature: string;
      credits: number;
      provider: string;
      latencyMs: number;
      success: boolean;
    }): void {
      usageManager.recordDeferred(params as any);
    },

    recordFailure(params: {
      userId: string;
      guildId: string;
      feature: string;
      credits: number;
    }): void {
      usageManager.record({ ...params, success: false } as any);
    },

    checkUsage(userId: string, guildId: string, feature: string, inputLength: number) {
      return usageManager.check(userId, guildId, feature as any, inputLength);
    },
  };
}
