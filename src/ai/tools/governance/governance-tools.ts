/* ================================================================
 * U7 GOVERNANCE TOOLS
 *
 * 9 tools for the Governance & Policy Engine.
 * All tools follow the existing U1-U6.1 patterns.
 * ================================================================ */

import type { Client } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../types";
import { createActionPlan } from "../executor";
import { storePendingPlan } from "../confirmation-store";
import { loadGuildAIConfig } from "../channel-scope";
import { logger } from "../../../logger";

import {
  loadPolicyConfig,
  savePolicyConfig,
  validatePolicyConfig,
  inspectPolicy,
  type GuildState,
  type ChannelInfo,
} from "./policy-engine";

import {
  isValidTemplate,
  getValidTemplateNames,
  applyTemplate,
  templateHasProhibitedPermissions,
  type TemplateName,
} from "./policy-templates";

import { detectDrift } from "./drift-detection";
import { generateRemediationPlan } from "./remediation";

import type {
  PolicyConfig,
  InspectionResult,
  DriftReport,
  RemediationPlan,
  GovernanceReport,
} from "./policy-schema";

/* ================================================================
 * GUILD STATE BUILDER
 *
 * Converts Discord.js guild data into the GuildState format
 * used by the deterministic policy evaluation engine.
 * ================================================================ */

function buildGuildState(guild: {
  id: string;
  channels: { cache: Map<string, any> };
  roles: { cache: Map<string, any>; everyone: { id: string } };
}): GuildState {
  const channels: ChannelInfo[] = [];
  const categories: ChannelInfo[] = [];

  guild.channels.cache.forEach((ch: any) => {
    const info: ChannelInfo = {
      id: ch.id,
      name: ch.name,
      type: ch.type,
      parentId: ch.parentId ?? null,
      topic: ch.topic ?? undefined,
      nsfw: ch.nsfw ?? undefined,
      permissionOverwrites: ch.permissionOverwrites
        ? Array.from(ch.permissionOverwrites.cache.values()).map((o: any) => ({
            id: o.id,
            type: o.type,
            allow: o.allow.bitfield?.toString() ?? "0",
            deny: o.deny.bitfield?.toString() ?? "0",
          }))
        : [],
    };

    if (ch.type === 4) {
      categories.push(info);
    } else {
      channels.push(info);
    }
  });

  const roles = Array.from(guild.roles.cache.values()).map((r: any) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    permissions: r.permissions.bitfield?.toString() ?? "0",
  }));

  return {
    guildId: guild.id,
    channels,
    categories,
    roles,
    everyoneRoleId: guild.roles.everyone.id,
  };
}

/* ================================================================
 * TOOL 1: view_guild_policy
 * ================================================================ */

export function createViewGuildPolicyTool(): ToolDefinition {
  return {
    name: "view_guild_policy",
    description: "View the current governance policy for this server.",
    category: "governance",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const config = loadPolicyConfig(context.guildId);

      const lines = [
        "📋 **Guild Policy**",
        "",
        `**Name:** ${config.name}`,
        `**Description:** ${config.description}`,
        `**Template:** ${config.template || "custom"}`,
        `**Rules:** ${config.rules.length} (${config.rules.filter((r) => r.enabled).length} enabled)`,
        `**Protected Channels:** ${config.protectedChannels.length}`,
        `**Protected Categories:** ${config.protectedCategories.length}`,
        `**Exempt Channels:** ${config.exemptChannels.length}`,
        `**Drift Detection:** ${config.driftDetection.enabled ? "enabled" : "disabled"}`,
        "",
        "**Rules:**",
        ...config.rules.map((r) =>
          `• ${r.enabled ? "✅" : "❌"} [${r.type}] ${r.description}`,
        ),
      ];

      return {
        status: "success",
        message: lines.join("\n"),
        data: config,
      };
    },
  };
}

/* ================================================================
 * TOOL 2: inspect_guild_governance
 * ================================================================ */

export function createInspectGuildGovernanceTool(
  getClient: () => Client | null,
): ToolDefinition {
  return {
    name: "inspect_guild_governance",
    description: "Inspect current Discord state against the active governance policy.",
    category: "governance",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const policy = loadPolicyConfig(context.guildId);
      const guildState = buildGuildState(guild);
      const result = inspectPolicy(policy, guildState);

      const lines = [
        "🔍 **Governance Inspection**",
        "",
        `**Policy:** ${result.policyName}`,
        `**Status:** ${result.status === "compliant" ? "✅ COMPLIANT" : "⚠️ VIOLATIONS FOUND"}`,
        `**Rules Evaluated:** ${result.totalRulesEvaluated}`,
        `**Violations:** ${result.totalViolations}`,
        `**Critical:** ${result.criticalViolations}`,
        "",
      ];

      if (result.violations.length > 0) {
        lines.push("**Violations:**");
        for (const v of result.violations) {
          const icon = v.severity === "critical" ? "🔴" : v.severity === "high" ? "🟠" : "🟡";
          lines.push(`${icon} ${v.message}`);
        }
      } else {
        lines.push("No violations found.");
      }

      return {
        status: "success",
        message: lines.join("\n"),
        data: result,
      };
    },
  };
}

/* ================================================================
 * TOOL 3: detect_policy_drift
 * ================================================================ */

export function createDetectPolicyDriftTool(
  getClient: () => Client | null,
): ToolDefinition {
  return {
    name: "detect_policy_drift",
    description: "Detect policy drift — changes in Discord state since policy was configured.",
    category: "governance",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const policy = loadPolicyConfig(context.guildId);
      const guildState = buildGuildState(guild);
      const report = detectDrift(policy, guildState);

      const lines = [
        "📊 **Policy Drift Report**",
        "",
        `**Status:** ${report.status === "NO_DRIFT" ? "✅ NO DRIFT" : "⚠️ DRIFT DETECTED"}`,
        `**Drifts Found:** ${report.totalDrifts}`,
        "",
      ];

      if (report.drift.length > 0) {
        lines.push("**Drift Details:**");
        for (const d of report.drift) {
          const icon = d.severity === "critical" ? "🔴" : d.severity === "high" ? "🟠" : d.severity === "medium" ? "🟡" : "🔵";
          lines.push(`${icon} [${d.ruleType}] Expected: ${d.expected}, Actual: ${d.actual}`);
        }
      }

      return {
        status: "success",
        message: lines.join("\n"),
        data: report,
      };
    },
  };
}

/* ================================================================
 * TOOL 4: generate_governance_report
 * ================================================================ */

export function createGenerateGovernanceReportTool(
  getClient: () => Client | null,
): ToolDefinition {
  return {
    name: "generate_governance_report",
    description: "Generate a comprehensive governance report combining inspection and drift.",
    category: "governance",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const policy = loadPolicyConfig(context.guildId);
      const guildState = buildGuildState(guild);
      const inspection = inspectPolicy(policy, guildState);
      const drift = detectDrift(policy, guildState);

      const report: GovernanceReport = {
        policyId: policy.id,
        policyName: policy.name,
        guildId: context.guildId,
        timestamp: Date.now(),
        status: inspection.status,
        summary: {
          totalRules: inspection.totalRulesEvaluated,
          violations: inspection.totalViolations,
          criticalViolations: inspection.criticalViolations,
          compliant: inspection.compliant.length,
          protectedResources: policy.protectedChannels.length + policy.protectedCategories.length,
          drifts: drift.totalDrifts,
        },
        violations: inspection.violations,
        drifts: drift.drift,
        protectedResources: inspection.protectedResources,
      };

      const lines = [
        "📊 **Governance Report**",
        "",
        `**Policy:** ${report.policyName}`,
        `**Status:** ${report.status === "compliant" ? "✅ COMPLIANT" : "⚠️ NEEDS ATTENTION"}`,
        "",
        "**Summary:**",
        `• Rules: ${report.summary.totalRules}`,
        `• Compliant: ${report.summary.compliant}`,
        `• Violations: ${report.summary.violations} (${report.summary.criticalViolations} critical)`,
        `• Protected Resources: ${report.summary.protectedResources}`,
        `• Drifts: ${report.summary.drifts}`,
      ];

      if (report.violations.length > 0) {
        lines.push("", "**Violations:**");
        for (const v of report.violations) {
          const icon = v.severity === "critical" ? "🔴" : v.severity === "high" ? "🟠" : "🟡";
          lines.push(`${icon} ${v.message}`);
        }
      }

      if (report.drifts.length > 0) {
        lines.push("", "**Drifts:**");
        for (const d of report.drifts) {
          lines.push(`• ${d.expected} → ${d.actual}`);
        }
      }

      return {
        status: "success",
        message: lines.join("\n"),
        data: report,
      };
    },
  };
}

/* ================================================================
 * TOOL 5: create_guild_policy
 * ================================================================ */

export function createCreateGuildPolicyTool(): ToolDefinition {
  return {
    name: "create_guild_policy",
    description: "Create or replace the governance policy for this server.",
    category: "governance",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageGuild"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "Policy name",
        required: true,
      },
      {
        name: "description",
        type: "string",
        description: "Policy description",
        required: false,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const name = String(context.arguments.name || "").trim();
      const description = String(context.arguments.description || "").trim();

      if (!name) return { status: "validation_error", message: "Missing required parameter: name" };

      const config: PolicyConfig = {
        id: `policy_${context.guildId}`,
        guildId: context.guildId,
        name,
        description: description || `Custom policy: ${name}`,
        rules: [],
        protectedChannels: loadGuildAIConfig(context.guildId).protectedChannels,
        protectedCategories: loadGuildAIConfig(context.guildId).protectedCategories,
        exemptChannels: [],
        exemptCategories: [],
        driftDetection: { enabled: false, intervalMs: 3600_000 },
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const validation = validatePolicyConfig(config);
      if (!validation.valid) {
        return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
      }

      const plan = createActionPlan(
        context,
        "medium",
        [{ type: "create", target: "governance policy", description: `Create policy "${name}"` }],
        true,
      );
      (plan as any).toolName = "create_guild_policy";
      plan.arguments = { ...context.arguments, _policyConfig: config };

      storePendingPlan(plan);

      return {
        status: "confirmation_required",
        message: [
          "📋 **ACTION PLAN**",
          "",
          "**Action:** Create Governance Policy",
          `**Name:** ${name}`,
          `**Description:** ${config.description}`,
          `**Rules:** 0 (empty policy)`,
          "",
          "**Risk:** MEDIUM",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes",
        ].join("\n"),
        plan,
      };
    },
  };
}

/* ================================================================
 * TOOL 6: update_guild_policy
 * ================================================================ */

export function createUpdateGuildPolicyTool(): ToolDefinition {
  return {
    name: "update_guild_policy",
    description: "Update the governance policy for this server.",
    category: "governance",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageGuild"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "New policy name",
        required: false,
      },
      {
        name: "description",
        type: "string",
        description: "New policy description",
        required: false,
      },
      {
        name: "driftDetectionEnabled",
        type: "boolean",
        description: "Enable/disable drift detection",
        required: false,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const existing = loadPolicyConfig(context.guildId);

      const name = context.arguments.name !== undefined ? String(context.arguments.name).trim() : existing.name;
      const description = context.arguments.description !== undefined ? String(context.arguments.description).trim() : existing.description;
      const driftEnabled = context.arguments.driftDetectionEnabled !== undefined
        ? Boolean(context.arguments.driftDetectionEnabled)
        : existing.driftDetection.enabled;

      const updated: PolicyConfig = {
        ...existing,
        name,
        description,
        driftDetection: { ...existing.driftDetection, enabled: driftEnabled },
        protectedChannels: loadGuildAIConfig(context.guildId).protectedChannels,
        protectedCategories: loadGuildAIConfig(context.guildId).protectedCategories,
        updatedAt: Date.now(),
      };

      const validation = validatePolicyConfig(updated);
      if (!validation.valid) {
        return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
      }

      const changes: Array<{ type: "modify"; target: string; description: string }> = [];
      if (name !== existing.name) changes.push({ type: "modify", target: "policy", description: `Rename to "${name}"` });
      if (description !== existing.description) changes.push({ type: "modify", target: "policy", description: "Update description" });
      if (driftEnabled !== existing.driftDetection.enabled) changes.push({ type: "modify", target: "policy", description: `${driftEnabled ? "Enable" : "Disable"} drift detection` });

      if (changes.length === 0) {
        return { status: "validation_error", message: "No changes specified." };
      }

      const plan = createActionPlan(context, "medium", changes, true);
      (plan as any).toolName = "update_guild_policy";
      plan.arguments = { ...context.arguments, _policyConfig: updated };

      storePendingPlan(plan);

      return {
        status: "confirmation_required",
        message: [
          "📋 **ACTION PLAN**",
          "",
          "**Action:** Update Governance Policy",
          ...changes.map((c) => `• ${c.description}`),
          "",
          "**Risk:** MEDIUM",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes",
        ].join("\n"),
        plan,
      };
    },
  };
}

/* ================================================================
 * TOOL 7: list_policy_templates
 * ================================================================ */

export function createListPolicyTemplatesTool(): ToolDefinition {
  return {
    name: "list_policy_templates",
    description: "List all available governance policy templates.",
    category: "governance",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const { getAllTemplateDefinitions } = await import("./policy-templates");
      const templates = getAllTemplateDefinitions();

      const lines = [
        "📋 **Policy Templates**",
        "",
        ...templates.map((t) =>
          `• **${t.name}** — ${t.description} (${t.rules.length} rules)`,
        ),
      ];

      return {
        status: "success",
        message: lines.join("\n"),
        data: templates.map((t) => ({ name: t.name, description: t.description, ruleCount: t.rules.length })),
      };
    },
  };
}

/* ================================================================
 * TOOL 8: apply_policy_template
 * ================================================================ */

export function createApplyPolicyTemplateTool(): ToolDefinition {
  return {
    name: "apply_policy_template",
    description: "Apply a governance policy template to this server.",
    category: "governance",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageGuild"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "template",
        type: "string",
        description: "Template name",
        required: true,
        allowedValues: getValidTemplateNames(),
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const templateName = String(context.arguments.template || "").trim();

      if (!templateName) return { status: "validation_error", message: "Missing required parameter: template" };
      if (!isValidTemplate(templateName)) {
        return {
          status: "validation_error",
          message: `Invalid template "${templateName}". Valid: ${getValidTemplateNames().join(", ")}`,
        };
      }

      if (templateHasProhibitedPermissions(templateName)) {
        return {
          status: "denied",
          message: "❌ Template contains prohibited permissions.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      const config = applyTemplate(templateName, context.guildId);
      config.protectedChannels = loadGuildAIConfig(context.guildId).protectedChannels;
      config.protectedCategories = loadGuildAIConfig(context.guildId).protectedCategories;

      const plan = createActionPlan(
        context,
        "high",
        [{ type: "create", target: "governance policy", description: `Apply "${templateName}" template (${config.rules.length} rules)` }],
        true,
      );
      (plan as any).toolName = "apply_policy_template";
      plan.arguments = { ...context.arguments, _policyConfig: config };

      storePendingPlan(plan);

      return {
        status: "confirmation_required",
        message: [
          "📋 **ACTION PLAN**",
          "",
          "**Action:** Apply Policy Template",
          `**Template:** ${templateName}`,
          `**Rules:** ${config.rules.length}`,
          "",
          "**Risk:** HIGH",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes",
        ].join("\n"),
        plan,
      };
    },
  };
}

/* ================================================================
 * TOOL 9: plan_policy_remediation
 * ================================================================ */

export function createPlanPolicyRemediationTool(
  getClient: () => Client | null,
): ToolDefinition {
  return {
    name: "plan_policy_remediation",
    description: "Generate remediation plans for detected policy violations. Read-only — does not modify Discord.",
    category: "governance",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageGuild"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const policy = loadPolicyConfig(context.guildId);
      const guildState = buildGuildState(guild);
      const driftReport = detectDrift(policy, guildState);

      if (driftReport.totalDrifts === 0) {
        return {
          status: "success",
          message: "✅ No policy drift detected. No remediation needed.",
          data: { drifts: 0 },
        };
      }

      const plans: RemediationPlan[] = [];
      for (const drift of driftReport.drift) {
        const plan = generateRemediationPlan(context.guildId, drift);
        if (plan) plans.push(plan);
      }

      if (plans.length === 0) {
        return {
          status: "success",
          message: "⚠️ Drift detected but no safe remediation could be generated (protected resources or manual intervention required).",
          data: { drifts: driftReport.totalDrifts, remediable: 0 },
        };
      }

      const lines = [
        "📋 **REMEDIATION PLANS**",
        "",
        `**Drifts Detected:** ${driftReport.totalDrifts}`,
        `**Remediable:** ${plans.length}`,
        "",
      ];

      for (const p of plans) {
        lines.push(`**${p.id}** [${p.riskLevel}]`);
        for (const s of p.steps) {
          lines.push(`  • ${s.description}`);
          lines.push(`    Tool: \`${s.toolName}\` | Risk: ${p.riskLevel}`);
        }
        lines.push("");
      }

      lines.push(
        "To execute a remediation, use the appropriate tool:",
        "• Permission changes → `manage_channel_permissions`",
        "• Preset changes → `apply_channel_preset`",
        "• Channel rename → `rename_channel`",
        "• Channel move → `move_channel`",
        "• Channel creation → `create_channel`",
        "• Category creation → `create_category`",
        "• Category protection → `protect_category`",
      );

      return {
        status: "success",
        message: lines.join("\n"),
        data: { plans, totalDrifts: driftReport.totalDrifts, remediable: plans.length },
      };
    },
  };
}

/* ================================================================
 * EXECUTE CONFIRMED PLAN — create_guild_policy
 *
 * Called by the interaction handler after verification.
 * Operates within the plan's trusted guild context.
 * ================================================================ */

export async function executeCreateGuildPolicyPlan(
  plan: ActionPlan,
): Promise<ToolResult> {
  const config = plan.arguments._policyConfig as PolicyConfig | undefined;
  if (!config) {
    return { status: "error", message: "Missing policy configuration in plan." };
  }

  if (config.guildId !== plan.guildId) {
    return { status: "denied", message: "Policy configuration guild does not match execution plan guild.", denialReason: "INVALID_ARGUMENTS" };
  }

  const validation = validatePolicyConfig(config);
  if (!validation.valid) {
    return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
  }

  savePolicyConfig(config);

  return {
    status: "success",
    message:
      `✅ **Policy created**\n` +
      `**Name:** ${config.name}\n` +
      `**Description:** ${config.description}\n` +
      `**Rules:** ${config.rules.length}\n` +
      `Action ID: \`${plan.id}\``,
    data: config,
  };
}

/* ================================================================
 * EXECUTE CONFIRMED PLAN — update_guild_policy
 * ================================================================ */

export async function executeUpdateGuildPolicyPlan(
  plan: ActionPlan,
): Promise<ToolResult> {
  const config = plan.arguments._policyConfig as PolicyConfig | undefined;
  if (!config) {
    return { status: "error", message: "Missing policy configuration in plan." };
  }

  if (config.guildId !== plan.guildId) {
    return { status: "denied", message: "Policy configuration guild does not match execution plan guild.", denialReason: "INVALID_ARGUMENTS" };
  }

  const validation = validatePolicyConfig(config);
  if (!validation.valid) {
    return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
  }

  savePolicyConfig(config);

  return {
    status: "success",
    message:
      `✅ **Policy updated**\n` +
      `**Name:** ${config.name}\n` +
      `**Description:** ${config.description}\n` +
      `**Rules:** ${config.rules.length}\n` +
      `Action ID: \`${plan.id}\``,
    data: config,
  };
}

/* ================================================================
 * EXECUTE CONFIRMED PLAN — apply_policy_template
 *
 * Defense in depth: re-checks prohibited permissions at execution time.
 * ================================================================ */

export async function executeApplyPolicyTemplatePlan(
  plan: ActionPlan,
): Promise<ToolResult> {
  const templateName = String(plan.arguments.template || "").trim();
  const config = plan.arguments._policyConfig as PolicyConfig | undefined;

  if (!templateName || !isValidTemplate(templateName)) {
    return { status: "validation_error", message: `Invalid template "${templateName}".` };
  }

  if (!config) {
    return { status: "error", message: "Missing policy configuration in plan." };
  }

  if (config.guildId !== plan.guildId) {
    return { status: "denied", message: "Policy configuration guild does not match execution plan guild.", denialReason: "INVALID_ARGUMENTS" };
  }

  if (templateHasProhibitedPermissions(templateName)) {
    return {
      status: "denied",
      message: "❌ Template contains prohibited permissions.",
      denialReason: "MISSING_DISCORD_PERMISSION",
    };
  }

  const validation = validatePolicyConfig(config);
  if (!validation.valid) {
    return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
  }

  savePolicyConfig(config);

  return {
    status: "success",
    message:
      `✅ **Policy template applied**\n` +
      `**Template:** ${templateName}\n` +
      `**Name:** ${config.name}\n` +
      `**Rules:** ${config.rules.length}\n` +
      `Action ID: \`${plan.id}\``,
    data: config,
  };
}

/* ================================================================
 * TOOL FACTORY
 * ================================================================ */

export function createGovernanceTools(
  getClient: () => Client | null,
): ToolDefinition[] {
  return [
    createViewGuildPolicyTool(),
    createInspectGuildGovernanceTool(getClient),
    createDetectPolicyDriftTool(getClient),
    createGenerateGovernanceReportTool(getClient),
    createCreateGuildPolicyTool(),
    createUpdateGuildPolicyTool(),
    createListPolicyTemplatesTool(),
    createApplyPolicyTemplateTool(),
    createPlanPolicyRemediationTool(getClient),
  ];
}
