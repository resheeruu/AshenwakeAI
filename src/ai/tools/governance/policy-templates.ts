/* ================================================================
 * U7 POLICY TEMPLATES
 *
 * Deterministic built-in templates for common governance profiles.
 * Templates are configuration starting points, not privilege escalation.
 * ================================================================ */

import type { PolicyConfig, PolicyRule } from "./policy-schema";
import { generateRuleId } from "./policy-engine";

/* ================================================================
 * TEMPLATE DEFINITIONS
 * ================================================================ */

export type TemplateName =
  | "community"
  | "gaming"
  | "moderated"
  | "staff-managed"
  | "private";

export const VALID_TEMPLATES: TemplateName[] = [
  "community",
  "gaming",
  "moderated",
  "staff-managed",
  "private",
];

/** Permissions that templates MUST NEVER grant */
const PROHIBITED_PERMISSIONS = [
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "BanMembers",
  "KickMembers",
  "MentionEveryone",
];

export function getProhibitedPermissions(): string[] {
  return [...PROHIBITED_PERMISSIONS];
}

export function isValidTemplate(name: string): name is TemplateName {
  return VALID_TEMPLATES.includes(name as TemplateName);
}

export function getValidTemplateNames(): TemplateName[] {
  return [...VALID_TEMPLATES];
}

export interface TemplateDefinition {
  name: TemplateName;
  description: string;
  rules: Omit<PolicyRule, "id">[];
}

/* ================================================================
 * TEMPLATE RULES
 * ================================================================ */

const COMMUNITY_RULES: Omit<PolicyRule, "id">[] = [
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have an announcements channel",
    requiredName: "announcements",
    expectedType: "announcement",
    riskIfViolated: "medium",
  },
  {
    type: "channel_type",
    enabled: true,
    description: "#announcements must be an announcement channel",
    channelPattern: "#announcements",
    expectedType: "announcement",
    riskIfViolated: "medium",
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#announcements: @everyone must not send messages",
    channelPattern: "#announcements",
    permission: "SendMessages",
    permissionOp: "must_deny",
    riskIfViolated: "high",
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#announcements: @everyone must view channel",
    channelPattern: "#announcements",
    permission: "ViewChannel",
    permissionOp: "must_allow",
    riskIfViolated: "medium",
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a general chat channel",
    requiredName: "general",
    riskIfViolated: "low",
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#general: @everyone must be able to send messages",
    channelPattern: "#general",
    permission: "SendMessages",
    permissionOp: "must_allow",
    riskIfViolated: "medium",
  },
];

const GAMING_RULES: Omit<PolicyRule, "id">[] = [
  {
    type: "required_category",
    enabled: true,
    description: "Server must have a 'Voice' category",
    requiredName: "Voice",
    riskIfViolated: "low",
  },
  {
    type: "required_category",
    enabled: true,
    description: "Server must have a 'Text' category",
    requiredName: "Text",
    riskIfViolated: "low",
  },
  {
    type: "category_protected",
    enabled: true,
    description: "Voice category should be protected",
    categoryPattern: "Voice",
    riskIfViolated: "high",
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "Voice channels: @everyone must be able to connect",
    channelPattern: "#*",
    permission: "Connect",
    permissionOp: "allow",
    riskIfViolated: "low",
  },
];

const MODERATED_RULES: Omit<PolicyRule, "id">[] = [
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #moderation channel",
    requiredName: "moderation",
    riskIfViolated: "high",
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #mod-logs channel",
    requiredName: "mod-logs",
    riskIfViolated: "high",
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have an #announcements channel",
    requiredName: "announcements",
    riskIfViolated: "medium",
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#moderation: @everyone must not send messages",
    channelPattern: "#moderation",
    permission: "SendMessages",
    permissionOp: "must_deny",
    riskIfViolated: "critical",
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#mod-logs: @everyone must not send messages",
    channelPattern: "#mod-logs",
    permission: "SendMessages",
    permissionOp: "must_deny",
    riskIfViolated: "critical",
  },
  {
    type: "channel_type",
    enabled: true,
    description: "#announcements must be announcement type",
    channelPattern: "#announcements",
    expectedType: "announcement",
    riskIfViolated: "medium",
  },
];

const STAFF_MANAGED_RULES: Omit<PolicyRule, "id">[] = [
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #staff channel",
    requiredName: "staff",
    riskIfViolated: "critical",
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #admin channel",
    requiredName: "admin",
    riskIfViolated: "critical",
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#staff: @everyone must not view channel",
    channelPattern: "#staff",
    permission: "ViewChannel",
    permissionOp: "must_deny",
    riskIfViolated: "critical",
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#admin: @everyone must not view channel",
    channelPattern: "#admin",
    permission: "ViewChannel",
    permissionOp: "must_deny",
    riskIfViolated: "critical",
  },
  {
    type: "category_protected",
    enabled: true,
    description: "Staff category should be protected",
    categoryPattern: "Staff",
    riskIfViolated: "high",
  },
];

const PRIVATE_RULES: Omit<PolicyRule, "id">[] = [
  {
    type: "channel_restricted",
    enabled: true,
    description: "All text channels: @everyone must not have default access",
    channelPattern: "#*",
    permission: "ViewChannel",
    riskIfViolated: "high",
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #rules channel",
    requiredName: "rules",
    riskIfViolated: "medium",
  },
];

/* ================================================================
 * TEMPLATE REGISTRY
 * ================================================================ */

const TEMPLATES: Record<TemplateName, TemplateDefinition> = {
  community: {
    name: "community",
    description: "Standard community server with public channels, announcements, and general chat.",
    rules: COMMUNITY_RULES,
  },
  gaming: {
    name: "gaming",
    description: "Gaming server with voice channels, game categories, and team coordination.",
    rules: GAMING_RULES,
  },
  moderated: {
    name: "moderated",
    description: "Moderation-focused server with mod channels, logs, and strict permissions.",
    rules: MODERATED_RULES,
  },
  "staff-managed": {
    name: "staff-managed",
    description: "Staff-only server with restricted channels and protected categories.",
    rules: STAFF_MANAGED_RULES,
  },
  private: {
    name: "private",
    description: "Private server with restricted access and minimal public channels.",
    rules: PRIVATE_RULES,
  },
};

export function getTemplateDefinition(name: TemplateName): TemplateDefinition {
  return TEMPLATES[name];
}

export function getAllTemplateDefinitions(): TemplateDefinition[] {
  return Object.values(TEMPLATES);
}

/* ================================================================
 * TEMPLATE APPLICATION
 * ================================================================ */

export function applyTemplate(
  templateName: TemplateName,
  guildId: string,
): PolicyConfig {
  const template = TEMPLATES[templateName];
  const now = Date.now();

  const rules: PolicyRule[] = template.rules.map((r) => ({
    ...r,
    id: generateRuleId(),
  }));

  return {
    id: `policy_${guildId}`,
    guildId,
    name: `${template.description.split(".")[0]} Policy`,
    description: `Governance policy based on the "${templateName}" template. ${template.description}`,
    template: templateName,
    rules,
    protectedChannels: [],
    protectedCategories: [],
    exemptChannels: [],
    exemptCategories: [],
    driftDetection: {
      enabled: true,
      intervalMs: 3600_000,
    },
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/* ================================================================
 * TEMPLATE SAFETY CHECK
 * ================================================================ */

export function templateHasProhibitedPermissions(templateName: TemplateName): boolean {
  const template = TEMPLATES[templateName];
  if (!template) return false;

  for (const rule of template.rules) {
    if (rule.permission && PROHIBITED_PERMISSIONS.includes(rule.permission)) {
      return true;
    }
  }
  return false;
}
