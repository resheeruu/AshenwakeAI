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
var governance_tools_exports = {};
__export(governance_tools_exports, {
  createApplyPolicyTemplateTool: () => createApplyPolicyTemplateTool,
  createCreateGuildPolicyTool: () => createCreateGuildPolicyTool,
  createDetectPolicyDriftTool: () => createDetectPolicyDriftTool,
  createGenerateGovernanceReportTool: () => createGenerateGovernanceReportTool,
  createGovernanceTools: () => createGovernanceTools,
  createInspectGuildGovernanceTool: () => createInspectGuildGovernanceTool,
  createListPolicyTemplatesTool: () => createListPolicyTemplatesTool,
  createPlanPolicyRemediationTool: () => createPlanPolicyRemediationTool,
  createUpdateGuildPolicyTool: () => createUpdateGuildPolicyTool,
  createViewGuildPolicyTool: () => createViewGuildPolicyTool,
  executeApplyPolicyTemplatePlan: () => executeApplyPolicyTemplatePlan,
  executeCreateGuildPolicyPlan: () => executeCreateGuildPolicyPlan,
  executeUpdateGuildPolicyPlan: () => executeUpdateGuildPolicyPlan
});
module.exports = __toCommonJS(governance_tools_exports);
var import_executor = require("../executor");
var import_confirmation_store = require("../confirmation-store");
var import_channel_scope = require("../channel-scope");
var import_policy_engine = require("./policy-engine");
var import_policy_templates = require("./policy-templates");
var import_drift_detection = require("./drift-detection");
var import_remediation = require("./remediation");
function buildGuildState(guild) {
  const channels = [];
  const categories = [];
  guild.channels.cache.forEach((ch) => {
    const info = {
      id: ch.id,
      name: ch.name,
      type: ch.type,
      parentId: ch.parentId ?? null,
      topic: ch.topic ?? void 0,
      nsfw: ch.nsfw ?? void 0,
      permissionOverwrites: ch.permissionOverwrites ? Array.from(ch.permissionOverwrites.cache.values()).map((o) => ({
        id: o.id,
        type: o.type,
        allow: o.allow.bitfield?.toString() ?? "0",
        deny: o.deny.bitfield?.toString() ?? "0"
      })) : []
    };
    if (ch.type === 4) {
      categories.push(info);
    } else {
      channels.push(info);
    }
  });
  const roles = Array.from(guild.roles.cache.values()).map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    permissions: r.permissions.bitfield?.toString() ?? "0"
  }));
  return {
    guildId: guild.id,
    channels,
    categories,
    roles,
    everyoneRoleId: guild.roles.everyone.id
  };
}
function createViewGuildPolicyTool() {
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
    execute: async (context) => {
      const config = (0, import_policy_engine.loadPolicyConfig)(context.guildId);
      const lines = [
        "\u{1F4CB} **Guild Policy**",
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
        ...config.rules.map(
          (r) => `\u2022 ${r.enabled ? "\u2705" : "\u274C"} [${r.type}] ${r.description}`
        )
      ];
      return {
        status: "success",
        message: lines.join("\n"),
        data: config
      };
    }
  };
}
function createInspectGuildGovernanceTool(getClient) {
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
    execute: async (context) => {
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      const policy = (0, import_policy_engine.loadPolicyConfig)(context.guildId);
      const guildState = buildGuildState(guild);
      const result = (0, import_policy_engine.inspectPolicy)(policy, guildState);
      const lines = [
        "\u{1F50D} **Governance Inspection**",
        "",
        `**Policy:** ${result.policyName}`,
        `**Status:** ${result.status === "compliant" ? "\u2705 COMPLIANT" : "\u26A0\uFE0F VIOLATIONS FOUND"}`,
        `**Rules Evaluated:** ${result.totalRulesEvaluated}`,
        `**Violations:** ${result.totalViolations}`,
        `**Critical:** ${result.criticalViolations}`,
        ""
      ];
      if (result.violations.length > 0) {
        lines.push("**Violations:**");
        for (const v of result.violations) {
          const icon = v.severity === "critical" ? "\u{1F534}" : v.severity === "high" ? "\u{1F7E0}" : "\u{1F7E1}";
          lines.push(`${icon} ${v.message}`);
        }
      } else {
        lines.push("No violations found.");
      }
      return {
        status: "success",
        message: lines.join("\n"),
        data: result
      };
    }
  };
}
function createDetectPolicyDriftTool(getClient) {
  return {
    name: "detect_policy_drift",
    description: "Detect policy drift \u2014 changes in Discord state since policy was configured.",
    category: "governance",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context) => {
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      const policy = (0, import_policy_engine.loadPolicyConfig)(context.guildId);
      const guildState = buildGuildState(guild);
      const report = (0, import_drift_detection.detectDrift)(policy, guildState);
      const lines = [
        "\u{1F4CA} **Policy Drift Report**",
        "",
        `**Status:** ${report.status === "NO_DRIFT" ? "\u2705 NO DRIFT" : "\u26A0\uFE0F DRIFT DETECTED"}`,
        `**Drifts Found:** ${report.totalDrifts}`,
        ""
      ];
      if (report.drift.length > 0) {
        lines.push("**Drift Details:**");
        for (const d of report.drift) {
          const icon = d.severity === "critical" ? "\u{1F534}" : d.severity === "high" ? "\u{1F7E0}" : d.severity === "medium" ? "\u{1F7E1}" : "\u{1F535}";
          lines.push(`${icon} [${d.ruleType}] Expected: ${d.expected}, Actual: ${d.actual}`);
        }
      }
      return {
        status: "success",
        message: lines.join("\n"),
        data: report
      };
    }
  };
}
function createGenerateGovernanceReportTool(getClient) {
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
    execute: async (context) => {
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      const policy = (0, import_policy_engine.loadPolicyConfig)(context.guildId);
      const guildState = buildGuildState(guild);
      const inspection = (0, import_policy_engine.inspectPolicy)(policy, guildState);
      const drift = (0, import_drift_detection.detectDrift)(policy, guildState);
      const report = {
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
          drifts: drift.totalDrifts
        },
        violations: inspection.violations,
        drifts: drift.drift,
        protectedResources: inspection.protectedResources
      };
      const lines = [
        "\u{1F4CA} **Governance Report**",
        "",
        `**Policy:** ${report.policyName}`,
        `**Status:** ${report.status === "compliant" ? "\u2705 COMPLIANT" : "\u26A0\uFE0F NEEDS ATTENTION"}`,
        "",
        "**Summary:**",
        `\u2022 Rules: ${report.summary.totalRules}`,
        `\u2022 Compliant: ${report.summary.compliant}`,
        `\u2022 Violations: ${report.summary.violations} (${report.summary.criticalViolations} critical)`,
        `\u2022 Protected Resources: ${report.summary.protectedResources}`,
        `\u2022 Drifts: ${report.summary.drifts}`
      ];
      if (report.violations.length > 0) {
        lines.push("", "**Violations:**");
        for (const v of report.violations) {
          const icon = v.severity === "critical" ? "\u{1F534}" : v.severity === "high" ? "\u{1F7E0}" : "\u{1F7E1}";
          lines.push(`${icon} ${v.message}`);
        }
      }
      if (report.drifts.length > 0) {
        lines.push("", "**Drifts:**");
        for (const d of report.drifts) {
          lines.push(`\u2022 ${d.expected} \u2192 ${d.actual}`);
        }
      }
      return {
        status: "success",
        message: lines.join("\n"),
        data: report
      };
    }
  };
}
function createCreateGuildPolicyTool() {
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
        required: true
      },
      {
        name: "description",
        type: "string",
        description: "Policy description",
        required: false
      }
    ],
    execute: async (context) => {
      const name = String(context.arguments.name || "").trim();
      const description = String(context.arguments.description || "").trim();
      if (!name) return { status: "validation_error", message: "Missing required parameter: name" };
      const config = {
        id: `policy_${context.guildId}`,
        guildId: context.guildId,
        name,
        description: description || `Custom policy: ${name}`,
        rules: [],
        protectedChannels: (0, import_channel_scope.loadGuildAIConfig)(context.guildId).protectedChannels,
        protectedCategories: (0, import_channel_scope.loadGuildAIConfig)(context.guildId).protectedCategories,
        exemptChannels: [],
        exemptCategories: [],
        driftDetection: { enabled: false, intervalMs: 36e5 },
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const validation = (0, import_policy_engine.validatePolicyConfig)(config);
      if (!validation.valid) {
        return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [{ type: "create", target: "governance policy", description: `Create policy "${name}"` }],
        true
      );
      plan.toolName = "create_guild_policy";
      plan.arguments = { ...context.arguments, _policyConfig: config };
      (0, import_confirmation_store.storePendingPlan)(plan);
      return {
        status: "confirmation_required",
        message: [
          "\u{1F4CB} **ACTION PLAN**",
          "",
          "**Action:** Create Governance Policy",
          `**Name:** ${name}`,
          `**Description:** ${config.description}`,
          `**Rules:** 0 (empty policy)`,
          "",
          "**Risk:** MEDIUM",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes"
        ].join("\n"),
        plan
      };
    }
  };
}
function createUpdateGuildPolicyTool() {
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
        required: false
      },
      {
        name: "description",
        type: "string",
        description: "New policy description",
        required: false
      },
      {
        name: "driftDetectionEnabled",
        type: "boolean",
        description: "Enable/disable drift detection",
        required: false
      }
    ],
    execute: async (context) => {
      const existing = (0, import_policy_engine.loadPolicyConfig)(context.guildId);
      const name = context.arguments.name !== void 0 ? String(context.arguments.name).trim() : existing.name;
      const description = context.arguments.description !== void 0 ? String(context.arguments.description).trim() : existing.description;
      const driftEnabled = context.arguments.driftDetectionEnabled !== void 0 ? Boolean(context.arguments.driftDetectionEnabled) : existing.driftDetection.enabled;
      const updated = {
        ...existing,
        name,
        description,
        driftDetection: { ...existing.driftDetection, enabled: driftEnabled },
        protectedChannels: (0, import_channel_scope.loadGuildAIConfig)(context.guildId).protectedChannels,
        protectedCategories: (0, import_channel_scope.loadGuildAIConfig)(context.guildId).protectedCategories,
        updatedAt: Date.now()
      };
      const validation = (0, import_policy_engine.validatePolicyConfig)(updated);
      if (!validation.valid) {
        return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
      }
      const changes = [];
      if (name !== existing.name) changes.push({ type: "modify", target: "policy", description: `Rename to "${name}"` });
      if (description !== existing.description) changes.push({ type: "modify", target: "policy", description: "Update description" });
      if (driftEnabled !== existing.driftDetection.enabled) changes.push({ type: "modify", target: "policy", description: `${driftEnabled ? "Enable" : "Disable"} drift detection` });
      if (changes.length === 0) {
        return { status: "validation_error", message: "No changes specified." };
      }
      const plan = (0, import_executor.createActionPlan)(context, "medium", changes, true);
      plan.toolName = "update_guild_policy";
      plan.arguments = { ...context.arguments, _policyConfig: updated };
      (0, import_confirmation_store.storePendingPlan)(plan);
      return {
        status: "confirmation_required",
        message: [
          "\u{1F4CB} **ACTION PLAN**",
          "",
          "**Action:** Update Governance Policy",
          ...changes.map((c) => `\u2022 ${c.description}`),
          "",
          "**Risk:** MEDIUM",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes"
        ].join("\n"),
        plan
      };
    }
  };
}
function createListPolicyTemplatesTool() {
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
    execute: async (context) => {
      const { getAllTemplateDefinitions } = await import("./policy-templates");
      const templates = getAllTemplateDefinitions();
      const lines = [
        "\u{1F4CB} **Policy Templates**",
        "",
        ...templates.map(
          (t) => `\u2022 **${t.name}** \u2014 ${t.description} (${t.rules.length} rules)`
        )
      ];
      return {
        status: "success",
        message: lines.join("\n"),
        data: templates.map((t) => ({ name: t.name, description: t.description, ruleCount: t.rules.length }))
      };
    }
  };
}
function createApplyPolicyTemplateTool() {
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
        allowedValues: (0, import_policy_templates.getValidTemplateNames)()
      }
    ],
    execute: async (context) => {
      const templateName = String(context.arguments.template || "").trim();
      if (!templateName) return { status: "validation_error", message: "Missing required parameter: template" };
      if (!(0, import_policy_templates.isValidTemplate)(templateName)) {
        return {
          status: "validation_error",
          message: `Invalid template "${templateName}". Valid: ${(0, import_policy_templates.getValidTemplateNames)().join(", ")}`
        };
      }
      if ((0, import_policy_templates.templateHasProhibitedPermissions)(templateName)) {
        return {
          status: "denied",
          message: "\u274C Template contains prohibited permissions.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
      }
      const config = (0, import_policy_templates.applyTemplate)(templateName, context.guildId);
      config.protectedChannels = (0, import_channel_scope.loadGuildAIConfig)(context.guildId).protectedChannels;
      config.protectedCategories = (0, import_channel_scope.loadGuildAIConfig)(context.guildId).protectedCategories;
      const plan = (0, import_executor.createActionPlan)(
        context,
        "high",
        [{ type: "create", target: "governance policy", description: `Apply "${templateName}" template (${config.rules.length} rules)` }],
        true
      );
      plan.toolName = "apply_policy_template";
      plan.arguments = { ...context.arguments, _policyConfig: config };
      (0, import_confirmation_store.storePendingPlan)(plan);
      return {
        status: "confirmation_required",
        message: [
          "\u{1F4CB} **ACTION PLAN**",
          "",
          "**Action:** Apply Policy Template",
          `**Template:** ${templateName}`,
          `**Rules:** ${config.rules.length}`,
          "",
          "**Risk:** HIGH",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes"
        ].join("\n"),
        plan
      };
    }
  };
}
function createPlanPolicyRemediationTool(getClient) {
  return {
    name: "plan_policy_remediation",
    description: "Generate remediation plans for detected policy violations. Read-only \u2014 does not modify Discord.",
    category: "governance",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageGuild"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context) => {
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      const policy = (0, import_policy_engine.loadPolicyConfig)(context.guildId);
      const guildState = buildGuildState(guild);
      const driftReport = (0, import_drift_detection.detectDrift)(policy, guildState);
      if (driftReport.totalDrifts === 0) {
        return {
          status: "success",
          message: "\u2705 No policy drift detected. No remediation needed.",
          data: { drifts: 0 }
        };
      }
      const plans = [];
      for (const drift of driftReport.drift) {
        const plan = (0, import_remediation.generateRemediationPlan)(context.guildId, drift);
        if (plan) plans.push(plan);
      }
      if (plans.length === 0) {
        return {
          status: "success",
          message: "\u26A0\uFE0F Drift detected but no safe remediation could be generated (protected resources or manual intervention required).",
          data: { drifts: driftReport.totalDrifts, remediable: 0 }
        };
      }
      const lines = [
        "\u{1F4CB} **REMEDIATION PLANS**",
        "",
        `**Drifts Detected:** ${driftReport.totalDrifts}`,
        `**Remediable:** ${plans.length}`,
        ""
      ];
      for (const p of plans) {
        lines.push(`**${p.id}** [${p.riskLevel}]`);
        for (const s of p.steps) {
          lines.push(`  \u2022 ${s.description}`);
          lines.push(`    Tool: \`${s.toolName}\` | Risk: ${p.riskLevel}`);
        }
        lines.push("");
      }
      lines.push(
        "To execute a remediation, use the appropriate tool:",
        "\u2022 Permission changes \u2192 `manage_channel_permissions`",
        "\u2022 Preset changes \u2192 `apply_channel_preset`",
        "\u2022 Channel rename \u2192 `rename_channel`",
        "\u2022 Channel move \u2192 `move_channel`",
        "\u2022 Channel creation \u2192 `create_channel`",
        "\u2022 Category creation \u2192 `create_category`",
        "\u2022 Category protection \u2192 `protect_category`"
      );
      return {
        status: "success",
        message: lines.join("\n"),
        data: { plans, totalDrifts: driftReport.totalDrifts, remediable: plans.length }
      };
    }
  };
}
async function executeCreateGuildPolicyPlan(plan) {
  const config = plan.arguments._policyConfig;
  if (!config) {
    return { status: "error", message: "Missing policy configuration in plan." };
  }
  if (config.guildId !== plan.guildId) {
    return { status: "denied", message: "Policy configuration guild does not match execution plan guild.", denialReason: "INVALID_ARGUMENTS" };
  }
  const validation = (0, import_policy_engine.validatePolicyConfig)(config);
  if (!validation.valid) {
    return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
  }
  (0, import_policy_engine.savePolicyConfig)(config);
  return {
    status: "success",
    message: `\u2705 **Policy created**
**Name:** ${config.name}
**Description:** ${config.description}
**Rules:** ${config.rules.length}
Action ID: \`${plan.id}\``,
    data: config
  };
}
async function executeUpdateGuildPolicyPlan(plan) {
  const config = plan.arguments._policyConfig;
  if (!config) {
    return { status: "error", message: "Missing policy configuration in plan." };
  }
  if (config.guildId !== plan.guildId) {
    return { status: "denied", message: "Policy configuration guild does not match execution plan guild.", denialReason: "INVALID_ARGUMENTS" };
  }
  const validation = (0, import_policy_engine.validatePolicyConfig)(config);
  if (!validation.valid) {
    return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
  }
  (0, import_policy_engine.savePolicyConfig)(config);
  return {
    status: "success",
    message: `\u2705 **Policy updated**
**Name:** ${config.name}
**Description:** ${config.description}
**Rules:** ${config.rules.length}
Action ID: \`${plan.id}\``,
    data: config
  };
}
async function executeApplyPolicyTemplatePlan(plan) {
  const templateName = String(plan.arguments.template || "").trim();
  const config = plan.arguments._policyConfig;
  if (!templateName || !(0, import_policy_templates.isValidTemplate)(templateName)) {
    return { status: "validation_error", message: `Invalid template "${templateName}".` };
  }
  if (!config) {
    return { status: "error", message: "Missing policy configuration in plan." };
  }
  if (config.guildId !== plan.guildId) {
    return { status: "denied", message: "Policy configuration guild does not match execution plan guild.", denialReason: "INVALID_ARGUMENTS" };
  }
  if ((0, import_policy_templates.templateHasProhibitedPermissions)(templateName)) {
    return {
      status: "denied",
      message: "\u274C Template contains prohibited permissions.",
      denialReason: "MISSING_DISCORD_PERMISSION"
    };
  }
  const validation = (0, import_policy_engine.validatePolicyConfig)(config);
  if (!validation.valid) {
    return { status: "validation_error", message: `Invalid policy: ${validation.errors.join(", ")}` };
  }
  (0, import_policy_engine.savePolicyConfig)(config);
  return {
    status: "success",
    message: `\u2705 **Policy template applied**
**Template:** ${templateName}
**Name:** ${config.name}
**Rules:** ${config.rules.length}
Action ID: \`${plan.id}\``,
    data: config
  };
}
function createGovernanceTools(getClient) {
  return [
    createViewGuildPolicyTool(),
    createInspectGuildGovernanceTool(getClient),
    createDetectPolicyDriftTool(getClient),
    createGenerateGovernanceReportTool(getClient),
    createCreateGuildPolicyTool(),
    createUpdateGuildPolicyTool(),
    createListPolicyTemplatesTool(),
    createApplyPolicyTemplateTool(),
    createPlanPolicyRemediationTool(getClient)
  ];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createApplyPolicyTemplateTool,
  createCreateGuildPolicyTool,
  createDetectPolicyDriftTool,
  createGenerateGovernanceReportTool,
  createGovernanceTools,
  createInspectGuildGovernanceTool,
  createListPolicyTemplatesTool,
  createPlanPolicyRemediationTool,
  createUpdateGuildPolicyTool,
  createViewGuildPolicyTool,
  executeApplyPolicyTemplatePlan,
  executeCreateGuildPolicyPlan,
  executeUpdateGuildPolicyPlan
});
