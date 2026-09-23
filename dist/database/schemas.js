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
var schemas_exports = {};
__export(schemas_exports, {
  AuditEntrySchema: () => AuditEntrySchema,
  AutomodSchema: () => AutomodSchema,
  BuilderSessionSchema: () => BuilderSessionSchema,
  ChatMessageSchema: () => ChatMessageSchema,
  CommunityConfigSchema: () => CommunityConfigSchema,
  GuildAIConfigSchema: () => GuildAIConfigSchema,
  GuildConfigSchema: () => GuildConfigSchema,
  MemoryConfigSchema: () => MemoryConfigSchema,
  ModerationConfigSchema: () => ModerationConfigSchema,
  PersonalityConfigSchema: () => PersonalityConfigSchema,
  TicketsConfigSchema: () => TicketsConfigSchema,
  UsageConfigSchema: () => UsageConfigSchema,
  validateSchema: () => validateSchema,
  validateWithFallback: () => validateWithFallback
});
module.exports = __toCommonJS(schemas_exports);
var import_zod = require("zod");
const AutomodSchema = import_zod.z.object({
  enabled: import_zod.z.boolean(),
  antiSpam: import_zod.z.boolean(),
  antiFlood: import_zod.z.boolean(),
  mentionSpam: import_zod.z.boolean(),
  antiCaps: import_zod.z.boolean(),
  antiInvite: import_zod.z.boolean(),
  antiLink: import_zod.z.boolean(),
  antiScam: import_zod.z.boolean(),
  antiZalgo: import_zod.z.boolean(),
  raidMode: import_zod.z.boolean(),
  maxMentions: import_zod.z.number(),
  maxMessages: import_zod.z.number(),
  floodWindowMs: import_zod.z.number()
});
const ModerationConfigSchema = import_zod.z.object({
  enabled: import_zod.z.boolean(),
  defaultTimeoutMinutes: import_zod.z.number(),
  maxWarnBeforeAction: import_zod.z.number(),
  autoBanOnMaxWarn: import_zod.z.boolean()
});
const TicketsConfigSchema = import_zod.z.object({
  enabled: import_zod.z.boolean(),
  types: import_zod.z.array(import_zod.z.string())
});
const CommunityConfigSchema = import_zod.z.object({
  xpEnabled: import_zod.z.boolean(),
  levelsEnabled: import_zod.z.boolean(),
  reactionRoles: import_zod.z.boolean(),
  welcomeEnabled: import_zod.z.boolean(),
  goodbyeEnabled: import_zod.z.boolean(),
  onboardingEnabled: import_zod.z.boolean()
});
const PersonalityConfigSchema = import_zod.z.object({
  name: import_zod.z.string(),
  tone: import_zod.z.string(),
  customInstructions: import_zod.z.string()
});
const MemoryConfigSchema = import_zod.z.object({
  enabled: import_zod.z.boolean(),
  maxMessages: import_zod.z.number()
});
const UsageConfigSchema = import_zod.z.object({
  dailyLimit: import_zod.z.number(),
  monthlyLimit: import_zod.z.number(),
  rateLimitPerMinute: import_zod.z.number(),
  burstLimit: import_zod.z.number()
});
const GuildConfigSchema = import_zod.z.object({
  guildId: import_zod.z.string(),
  guildName: import_zod.z.string().nullish(),
  enabled: import_zod.z.boolean(),
  assistantChannelId: import_zod.z.string().nullish(),
  ticketCategoryId: import_zod.z.string().nullish(),
  logChannelId: import_zod.z.string().nullish(),
  verificationRoleId: import_zod.z.string().nullish(),
  welcomeChannelId: import_zod.z.string().nullish(),
  automod: AutomodSchema,
  moderation: ModerationConfigSchema,
  tickets: TicketsConfigSchema,
  community: CommunityConfigSchema,
  automation: import_zod.z.object({ enabled: import_zod.z.boolean() }),
  personality: PersonalityConfigSchema,
  memory: MemoryConfigSchema,
  usage: UsageConfigSchema,
  support: import_zod.z.object({
    enabled: import_zod.z.boolean(),
    channelId: import_zod.z.string().nullish(),
    categoryId: import_zod.z.string().nullish(),
    allowGeneralHelp: import_zod.z.boolean(),
    allowReports: import_zod.z.boolean(),
    allowAppeals: import_zod.z.boolean()
  }).nullish(),
  reports: import_zod.z.object({
    enabled: import_zod.z.boolean(),
    categoryId: import_zod.z.string().nullish(),
    requireEvidence: import_zod.z.boolean(),
    aiAnalysisEnabled: import_zod.z.boolean(),
    autoEscalateHighRisk: import_zod.z.boolean()
  }).nullish(),
  appeals: import_zod.z.object({
    enabled: import_zod.z.boolean(),
    categoryId: import_zod.z.string().nullish(),
    aiAnalysisEnabled: import_zod.z.boolean()
  }).nullish(),
  supportAi: import_zod.z.object({
    enabled: import_zod.z.boolean(),
    allowModerationActions: import_zod.z.boolean(),
    requireConfirmation: import_zod.z.boolean(),
    allowWebResearch: import_zod.z.boolean()
  }).nullish(),
  supportLogging: import_zod.z.object({
    enabled: import_zod.z.boolean(),
    channelId: import_zod.z.string().nullish(),
    includeModeration: import_zod.z.boolean(),
    includeTickets: import_zod.z.boolean(),
    includeReports: import_zod.z.boolean(),
    includeAppeals: import_zod.z.boolean(),
    includeAiActions: import_zod.z.boolean()
  }).nullish(),
  staff: import_zod.z.object({
    roleIds: import_zod.z.array(import_zod.z.string())
  }).nullish(),
  createdAt: import_zod.z.number(),
  updatedAt: import_zod.z.number()
});
const GuildAIConfigSchema = import_zod.z.object({
  guildId: import_zod.z.string(),
  enabled: import_zod.z.boolean(),
  managementEnabled: import_zod.z.boolean(),
  channelScopes: import_zod.z.record(import_zod.z.string(), import_zod.z.array(import_zod.z.string())),
  managementRoleIds: import_zod.z.array(import_zod.z.string()),
  chatRoleIds: import_zod.z.array(import_zod.z.string()),
  protectedChannels: import_zod.z.array(import_zod.z.string()),
  protectedCategories: import_zod.z.array(import_zod.z.string()),
  trustedUserIds: import_zod.z.array(import_zod.z.string()),
  version: import_zod.z.number(),
  createdAt: import_zod.z.number(),
  updatedAt: import_zod.z.number()
});
const AuditEntrySchema = import_zod.z.object({
  id: import_zod.z.string(),
  timestamp: import_zod.z.number(),
  who: import_zod.z.string(),
  whoName: import_zod.z.string().nullish(),
  what: import_zod.z.string(),
  where: import_zod.z.string(),
  guildId: import_zod.z.string().nullish(),
  reason: import_zod.z.string().nullish(),
  result: import_zod.z.enum(["success", "failure", "denied", "error"]),
  details: import_zod.z.string().nullish(),
  signature: import_zod.z.string().nullish(),
  prevHash: import_zod.z.string().nullish()
});
const ChatMessageSchema = import_zod.z.object({
  role: import_zod.z.enum(["user", "assistant", "system"]),
  content: import_zod.z.string()
});
const BuilderSessionSchema = import_zod.z.object({
  guildId: import_zod.z.string(),
  channelId: import_zod.z.string(),
  threadId: import_zod.z.string(),
  userId: import_zod.z.string(),
  startedAt: import_zod.z.number(),
  lastActivityAt: import_zod.z.number(),
  pendingPlan: import_zod.z.object({
    id: import_zod.z.string(),
    goal: import_zod.z.string(),
    steps: import_zod.z.array(import_zod.z.object({
      toolName: import_zod.z.string(),
      args: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()),
      description: import_zod.z.string(),
      category: import_zod.z.string()
    })),
    templateName: import_zod.z.string().nullish()
  }).nullish(),
  serverState: import_zod.z.object({
    categories: import_zod.z.array(import_zod.z.object({ id: import_zod.z.string(), name: import_zod.z.string() })),
    channels: import_zod.z.array(import_zod.z.object({ id: import_zod.z.string(), name: import_zod.z.string(), type: import_zod.z.string(), categoryId: import_zod.z.string().nullish() })),
    roles: import_zod.z.array(import_zod.z.object({ id: import_zod.z.string(), name: import_zod.z.string() })),
    protectedChannels: import_zod.z.array(import_zod.z.string()),
    protectedCategories: import_zod.z.array(import_zod.z.string())
  }).nullish(),
  lastStateFetchedAt: import_zod.z.number(),
  warnedExpiry: import_zod.z.boolean().nullish(),
  _needsExpiryWarning: import_zod.z.boolean().nullish()
});
function validateSchema(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  return null;
}
function validateWithFallback(schema, data, fallback) {
  return validateSchema(schema, data) ?? fallback;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuditEntrySchema,
  AutomodSchema,
  BuilderSessionSchema,
  ChatMessageSchema,
  CommunityConfigSchema,
  GuildAIConfigSchema,
  GuildConfigSchema,
  MemoryConfigSchema,
  ModerationConfigSchema,
  PersonalityConfigSchema,
  TicketsConfigSchema,
  UsageConfigSchema,
  validateSchema,
  validateWithFallback
});
