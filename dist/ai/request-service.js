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
var request_service_exports = {};
__export(request_service_exports, {
  createAIRequestService: () => createAIRequestService
});
module.exports = __toCommonJS(request_service_exports);
var import_security = require("../security");
var import_boundary = require("../security/boundary");
var import_policy = require("../security/policy");
var import_output_guard = require("../security/output-guard");
var import_context = require("../security/context");
var import_logger = require("../logger");
const MAX_RESPONSE_LENGTH = 1900;
function cleanResponse(text) {
  const cleaned = text.trim();
  if (!cleaned) return "I wasn't able to generate a response.";
  if (cleaned.length <= MAX_RESPONSE_LENGTH) return cleaned;
  return cleaned.slice(0, MAX_RESPONSE_LENGTH - 20).trimEnd() + "\n\n\u2026(response shortened)";
}
function createAIRequestService(deps) {
  const { router, memory, usageManager } = deps;
  return {
    async processRequest(params) {
      const { userId, guildId, channelId, prompt, source, systemPrompt, temperature, maxTokens, model } = params;
      const boundary = (0, import_boundary.checkBoundary)(prompt);
      if (boundary.matched && boundary.response) {
        return {
          success: true,
          text: boundary.response,
          provider: "",
          model: "",
          latencyMs: 0,
          blocked: false,
          boundaryMatched: true
        };
      }
      const security = (0, import_security.inspectUserInput)(prompt);
      if (security.decision === "BLOCK") {
        return {
          success: true,
          text: security.safeResponse || "I can't process that request.",
          provider: "",
          model: "",
          latencyMs: 0,
          blocked: true,
          blockReason: security.classification || "security_policy",
          boundaryMatched: false
        };
      }
      const history = memory.get(userId, channelId);
      const messages = [
        { role: "system", content: systemPrompt || import_policy.ASHENAI_SYSTEM_PROMPT },
        ...history.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: "user", content: prompt }
      ];
      const response = await router.generate({
        messages,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 1200,
        guildId,
        userId,
        channelId,
        source,
        ...model ? { model } : {}
      });
      if (!response || !response.text || !response.text.trim()) {
        throw new Error("AI router returned an empty response.");
      }
      const guarded = (0, import_output_guard.guardAIOutput)(response.text);
      if (!guarded.allowed) {
        import_logger.logger.warn(`\u{1F6E1}\uFE0F AI output blocked (${source}): ${guarded.reason ?? "security_policy"}`);
      }
      const reply = cleanResponse((0, import_context.stripSecurityLabels)(guarded.text));
      memory.addBatch(userId, { role: "user", content: prompt }, channelId);
      memory.addBatch(userId, { role: "assistant", content: guarded.text }, channelId);
      return {
        success: true,
        text: reply,
        provider: response.provider,
        model: response.model,
        latencyMs: response.latencyMs,
        blocked: false,
        boundaryMatched: false
      };
    },
    flush() {
      memory.flushBatch();
      usageManager.flush();
    },
    recordUsage(params) {
      usageManager.recordDeferred(params);
    },
    recordFailure(params) {
      usageManager.record({ ...params, success: false });
    },
    checkUsage(userId, guildId, feature, inputLength) {
      return usageManager.check(userId, guildId, feature, inputLength);
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAIRequestService
});
