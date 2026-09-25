import { z } from "zod";

/* ================================================================
 * GUILD CONFIG SCHEMA
 * ================================================================ */

export const AutomodSchema = z.object({
  enabled: z.boolean(),
  antiSpam: z.boolean(),
  antiFlood: z.boolean(),
  mentionSpam: z.boolean(),
  antiCaps: z.boolean(),
  antiInvite: z.boolean(),
  antiLink: z.boolean(),
  antiScam: z.boolean(),
  antiZalgo: z.boolean(),
  raidMode: z.boolean(),
  maxMentions: z.number(),
  maxMessages: z.number(),
  floodWindowMs: z.number(),
});

export const ModerationConfigSchema = z.object({
  enabled: z.boolean(),
  defaultTimeoutMinutes: z.number(),
  maxWarnBeforeAction: z.number(),
  autoBanOnMaxWarn: z.boolean(),
});

export const TicketsConfigSchema = z.object({
  enabled: z.boolean(),
  types: z.array(z.string()),
});

export const CommunityConfigSchema = z.object({
  xpEnabled: z.boolean(),
  levelsEnabled: z.boolean(),
  reactionRoles: z.boolean(),
  welcomeEnabled: z.boolean(),
  goodbyeEnabled: z.boolean(),
  onboardingEnabled: z.boolean(),
});

export const PersonalityConfigSchema = z.object({
  name: z.string(),
  tone: z.string(),
  customInstructions: z.string(),
});

export const MemoryConfigSchema = z.object({
  enabled: z.boolean(),
  maxMessages: z.number(),
});

export const UsageConfigSchema = z.object({
  dailyLimit: z.number(),
  monthlyLimit: z.number(),
  rateLimitPerMinute: z.number(),
  burstLimit: z.number(),
});

export const GuildConfigSchema = z.object({
  guildId: z.string(),
  guildName: z.string().nullish(),
  enabled: z.boolean(),
  assistantChannelId: z.string().nullish(),
  ticketCategoryId: z.string().nullish(),
  logChannelId: z.string().nullish(),
  verificationRoleId: z.string().nullish(),
  welcomeChannelId: z.string().nullish(),
  automod: AutomodSchema,
  moderation: ModerationConfigSchema,
  tickets: TicketsConfigSchema,
  community: CommunityConfigSchema,
  automation: z.object({ enabled: z.boolean() }),
  personality: PersonalityConfigSchema,
  memory: MemoryConfigSchema,
  usage: UsageConfigSchema,
  support: z.object({
    enabled: z.boolean(),
    channelId: z.string().nullish(),
    categoryId: z.string().nullish(),
    allowGeneralHelp: z.boolean(),
    allowReports: z.boolean(),
    allowAppeals: z.boolean(),
  }).nullish(),
  reports: z.object({
    enabled: z.boolean(),
    categoryId: z.string().nullish(),
    requireEvidence: z.boolean(),
    aiAnalysisEnabled: z.boolean(),
    autoEscalateHighRisk: z.boolean(),
  }).nullish(),
  appeals: z.object({
    enabled: z.boolean(),
    categoryId: z.string().nullish(),
    aiAnalysisEnabled: z.boolean(),
  }).nullish(),
  supportAi: z.object({
    enabled: z.boolean(),
    allowModerationActions: z.boolean(),
    requireConfirmation: z.boolean(),
    allowWebResearch: z.boolean(),
  }).nullish(),
  supportLogging: z.object({
    enabled: z.boolean(),
    channelId: z.string().nullish(),
    includeModeration: z.boolean(),
    includeTickets: z.boolean(),
    includeReports: z.boolean(),
    includeAppeals: z.boolean(),
    includeAiActions: z.boolean(),
  }).nullish(),
  staff: z.object({
    roleIds: z.array(z.string()),
  }).nullish(),
  /*
   * Sections below exist on the GuildConfig interface but were
   * MISSING here. Zod strips unknown keys on a successful parse, so
   * every fresh DB load silently deleted them (in-process cache
   * masked it): social/AI settings reverted to defaults after a
   * restart, including social.animeActions. Keep this list in sync
   * with the GuildConfig interface — a regression test in
   * scripts/test-ai-social.ts round-trips every section.
   */
  social: z.object({
    enabled: z.boolean(),
    channels: z.record(z.string(), z.object({
      enabled: z.boolean(),
      cooldownMs: z.number(),
      responseProbability: z.number(),
      debateEnabled: z.boolean(),
      contextWindow: z.number(),
      minActivityThreshold: z.number(),
    })),
    animeActions: z.boolean(),
    /**
     * Clear a user's AFK automatically when they send a normal
     * message. Optional (older rows lack it); consumers read it
     * as `?? true` so the documented default is ON.
     */
    afkAutoClear: z.boolean().nullish(),
    customReactions: z.boolean(),
    customEmoji: z.boolean(),
    rivalryMode: z.boolean(),
    debateMode: z.boolean(),
    globalCooldownMs: z.number(),
    maxResponsesPerHour: z.number(),
  }).nullish(),
  ai: z.object({
    enabled: z.boolean(),
    defaultModel: z.string().nullish(),
    defaultProvider: z.string().nullish(),
    responseMode: z.string().nullish(),
    streaming: z.boolean(),
    contextSize: z.number(),
    maxOutput: z.number(),
  }).nullish(),
  routing: z.object({
    primaryProvider: z.string().nullish(),
    fallbackProvider: z.string().nullish(),
    fallbackOrder: z.array(z.string()),
    timeoutMs: z.number(),
    retryPolicy: z.string(),
    mode: z.enum(["automatic", "fastest", "lowest-cost", "free-first", "custom"]),
  }).nullish(),
  limits: z.object({
    dailyLimit: z.number(),
    monthlyLimit: z.number(),
    perUserLimit: z.number(),
    perRoleLimit: z.number(),
    perChannelLimit: z.number(),
  }).nullish(),
  models: z.array(z.object({
    modelId: z.string(),
    enabled: z.boolean(),
    priority: z.number(),
    isDefault: z.boolean(),
  })).nullish(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ValidatedGuildConfig = z.infer<typeof GuildConfigSchema>;

/* ================================================================
 * GUILD AI CONFIG SCHEMA
 * ================================================================ */

export const GuildAIConfigSchema = z.object({
  guildId: z.string(),
  enabled: z.boolean(),
  managementEnabled: z.boolean(),
  channelScopes: z.record(z.string(), z.array(z.string())),
  managementRoleIds: z.array(z.string()),
  chatRoleIds: z.array(z.string()),
  protectedChannels: z.array(z.string()),
  protectedCategories: z.array(z.string()),
  trustedUserIds: z.array(z.string()),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ValidatedGuildAIConfig = z.infer<typeof GuildAIConfigSchema>;

/* ================================================================
 * AUDIT ENTRY SCHEMA
 * ================================================================ */

export const AuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  who: z.string(),
  whoName: z.string().nullish(),
  what: z.string(),
  where: z.string(),
  guildId: z.string().nullish(),
  reason: z.string().nullish(),
  result: z.enum(["success", "failure", "denied", "error"]),
  details: z.string().nullish(),
  signature: z.string().nullish(),
  prevHash: z.string().nullish(),
});

export type ValidatedAuditEntry = z.infer<typeof AuditEntrySchema>;

/* ================================================================
 * CONVERSATION MESSAGE SCHEMA
 * ================================================================ */

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type ValidatedChatMessage = z.infer<typeof ChatMessageSchema>;

/* ================================================================
 * BUILDER SESSION SCHEMA
 * ================================================================ */

export const BuilderSessionSchema = z.object({
  guildId: z.string(),
  channelId: z.string(),
  threadId: z.string(),
  userId: z.string(),
  startedAt: z.number(),
  lastActivityAt: z.number(),
  pendingPlan: z.object({
    id: z.string(),
    goal: z.string(),
    steps: z.array(z.object({
      toolName: z.string(),
      args: z.record(z.string(), z.unknown()),
      description: z.string(),
      category: z.string(),
    })),
    templateName: z.string().nullish(),
  }).nullish(),
  serverState: z.object({
    categories: z.array(z.object({ id: z.string(), name: z.string() })),
    channels: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), categoryId: z.string().nullish() })),
    roles: z.array(z.object({ id: z.string(), name: z.string() })),
    protectedChannels: z.array(z.string()),
    protectedCategories: z.array(z.string()),
  }).nullish(),
  lastStateFetchedAt: z.number(),
  warnedExpiry: z.boolean().nullish(),
  _needsExpiryWarning: z.boolean().nullish(),
});

export type ValidatedBuilderSession = z.infer<typeof BuilderSessionSchema>;

/* ================================================================
 * VALIDATION HELPERS
 * ================================================================ */

/**
 * Validate and parse data with a Zod schema, returning null on failure.
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  return null;
}

/**
 * Validate and parse data with a Zod schema, returning fallback on failure.
 */
export function validateWithFallback<T>(schema: z.ZodSchema<T>, data: unknown, fallback: T): T {
  return validateSchema(schema, data) ?? fallback;
}
