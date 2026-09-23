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
var ask_exports = {};
__export(ask_exports, {
  createAskCommand: () => createAskCommand
});
module.exports = __toCommonJS(ask_exports);
var import_logger = require("../logger");
var import_discord = require("discord.js");
var import_env = require("../config/env");
var import_request_service = require("../ai/request-service");
var import_timing = require("../ai/timing");
function createAskCommand(router, memory, usageManager) {
  const aiService = (0, import_request_service.createAIRequestService)({ router, memory, usageManager });
  return {
    data: new import_discord.SlashCommandBuilder().setName("ask").setDescription("Ask AshenAI a question").addStringOption(
      (option) => option.setName("question").setDescription("Your question").setRequired(true).setMaxLength(4e3)
    ),
    async execute(interaction) {
      const t = new import_timing.StageTimer("/ask");
      const userId = interaction.user.id;
      const guildId = interaction.guildId || "";
      const prompt = interaction.options.getString("question", true).trim();
      t.mark("extract_args");
      const usageCheck = aiService.checkUsage(userId, guildId, "ask", prompt.length);
      t.mark("usage_check");
      if (!usageCheck.allowed) {
        const retrySeconds = usageCheck.retryAfterMs ? Math.max(1, Math.ceil(usageCheck.retryAfterMs / 1e3)) : 60;
        const reasonText = {
          cooldown: "You're on a brief cooldown.",
          daily_limit: "You've reached your daily AI limit.",
          monthly_limit: "You've reached your monthly AI limit.",
          rate_limit: "You're sending requests too quickly.",
          burst_limit: "Too many requests in a short time.",
          concurrent_limit: "Too many concurrent requests. Please wait."
        };
        await interaction.editReply(
          `\u23F3 ${reasonText[usageCheck.reason || ""] || "Request limit reached."} Try again in ${retrySeconds}s.`
        );
        return;
      }
      try {
        if (!prompt) {
          await interaction.editReply("\u274C Please provide a question.");
          return;
        }
        const creatorQuestion = /\b(who|what)\b.*\b(creator|created|made|owner)\b/i.test(prompt) || /\bwho('?s| is)\b.*\b(owner|creator)\b/i.test(prompt);
        if (creatorQuestion) {
          const creatorId = import_env.config.creator.discord;
          await interaction.editReply(
            creatorId ? `\u{1F451} My creator is <@${creatorId}>.` : "\u{1F451} My creator is not configured yet."
          );
          return;
        }
        t.mark("pre_ai");
        const result = await aiService.processRequest({
          userId,
          guildId,
          channelId: interaction.channelId || "",
          prompt,
          source: "ask"
        });
        t.mark("ai_generate");
        if (result.boundaryMatched) {
          await interaction.editReply(result.text);
          return;
        }
        aiService.recordUsage({
          userId,
          guildId,
          feature: "ask",
          credits: usageCheck.credits,
          provider: result.provider,
          latencyMs: result.latencyMs,
          success: true
        });
        t.mark("usage_record");
        await interaction.editReply(result.text);
        t.mark("discord_reply");
        aiService.flush();
        t.log();
        import_logger.logger.debug(`\u2705 /ask response sent using ${result.provider} in ${result.latencyMs}ms`);
      } catch (error) {
        import_logger.logger.error("\u274C /ask failed:", error instanceof Error ? error.message : String(error));
        aiService.recordFailure({
          userId,
          guildId,
          feature: "ask",
          credits: usageCheck.credits
        });
        try {
          if (interaction.isRepliable()) {
            await interaction.editReply("\u274C I couldn't get a response right now. Please try again.");
          }
        } catch {
        }
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAskCommand
});
