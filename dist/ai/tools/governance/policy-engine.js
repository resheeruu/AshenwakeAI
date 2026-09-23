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
var policy_engine_exports = {};
__export(policy_engine_exports, {
  deletePolicyConfig: () => deletePolicyConfig,
  evaluateRule: () => evaluateRule,
  generateRuleId: () => generateRuleId,
  hasPolicy: () => hasPolicy,
  inspectPolicy: () => inspectPolicy,
  loadPolicyConfig: () => loadPolicyConfig,
  matchesPattern: () => matchesPattern,
  savePolicyConfig: () => savePolicyConfig,
  validatePolicyConfig: () => validatePolicyConfig,
  validateRule: () => validateRule
});
module.exports = __toCommonJS(policy_engine_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../../../logger");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const POLICIES_DIR = import_path.default.join(DATA_DIR, "governance-policies");
function getPolicyPath(guildId) {
  return import_path.default.join(POLICIES_DIR, `${guildId}.json`);
}
const CURRENT_VERSION = 1;
function defaultPolicyConfig(guildId) {
  return {
    id: `policy_${guildId}`,
    guildId,
    name: "Default Policy",
    description: "Default governance policy",
    rules: [],
    protectedChannels: [],
    protectedCategories: [],
    exemptChannels: [],
    exemptCategories: [],
    driftDetection: {
      enabled: false,
      intervalMs: 36e5
    },
    version: CURRENT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function loadPolicyConfig(guildId) {
  const filePath = getPolicyPath(guildId);
  try {
    if (!import_fs.default.existsSync(filePath)) return defaultPolicyConfig(guildId);
    const raw = import_fs.default.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaultPolicyConfig(guildId), ...parsed, guildId };
  } catch {
    return defaultPolicyConfig(guildId);
  }
}
function savePolicyConfig(config) {
  try {
    import_fs.default.mkdirSync(POLICIES_DIR, { recursive: true });
    config.updatedAt = Date.now();
    const filePath = getPolicyPath(config.guildId);
    const tmpPath = filePath + ".tmp";
    import_fs.default.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf8");
    import_fs.default.renameSync(tmpPath, filePath);
  } catch (error) {
    import_logger.logger.warn(
      `Could not save governance policy for ${config.guildId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function deletePolicyConfig(guildId) {
  try {
    const filePath = getPolicyPath(guildId);
    if (import_fs.default.existsSync(filePath)) {
      import_fs.default.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
function hasPolicy(guildId) {
  const filePath = getPolicyPath(guildId);
  return import_fs.default.existsSync(filePath);
}
function generateRuleId() {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function validateRule(rule) {
  if (!rule.id || typeof rule.id !== "string") return { valid: false, error: "Rule must have an id" };
  if (!rule.type) return { valid: false, error: "Rule must have a type" };
  if (!rule.description || typeof rule.description !== "string") return { valid: false, error: "Rule must have a description" };
  const validTypes = [
    "channel_type",
    "channel_permission",
    "category_protected",
    "required_channel",
    "required_category",
    "channel_restricted"
  ];
  if (!validTypes.includes(rule.type)) return { valid: false, error: `Invalid rule type: ${rule.type}` };
  if (rule.type === "channel_type" && !rule.expectedType) {
    return { valid: false, error: "channel_type rule requires expectedType" };
  }
  if (rule.type === "channel_permission" && (!rule.permission || !rule.permissionOp)) {
    return { valid: false, error: "channel_permission rule requires permission and permissionOp" };
  }
  if ((rule.type === "required_channel" || rule.type === "required_category") && !rule.requiredName) {
    return { valid: false, error: `${rule.type} rule requires requiredName` };
  }
  return { valid: true };
}
function validatePolicyConfig(config) {
  const errors = [];
  if (!config.guildId) errors.push("Missing guildId");
  if (!config.name) errors.push("Missing name");
  if (!Array.isArray(config.rules)) errors.push("rules must be an array");
  for (const rule of config.rules) {
    const result = validateRule(rule);
    if (!result.valid) errors.push(`Rule ${rule.id || "(no id)"}: ${result.error}`);
  }
  return { valid: errors.length === 0, errors };
}
function matchesPattern(name, pattern) {
  if (pattern === "*") return true;
  if (pattern === "#*") return true;
  const cleanName = name.replace(/^#/, "");
  const cleanPattern = pattern.replace(/^#/, "");
  const regexStr = cleanPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${regexStr}$`, "i");
  return regex.test(cleanName);
}
const CHANNEL_TYPE_MAP = {
  0: "text",
  2: "voice",
  4: "category",
  5: "announcement",
  13: "stage",
  15: "forum"
};
function getChannelKind(type) {
  return CHANNEL_TYPE_MAP[type] || "unknown";
}
function channelMatchesPattern(channel, pattern) {
  return matchesPattern(`#${channel.name}`, pattern);
}
function categoryMatchesPattern(category, pattern) {
  return matchesPattern(category.name, pattern);
}
function checkPermissionOverwrite(channel, roleId, permission) {
  const overwrite = channel.permissionOverwrites?.find(
    (o) => o.id === roleId && o.type === 0
  );
  if (!overwrite) return { hasAllow: false, hasDeny: false };
  const permBit = permissionToBigInt(permission);
  if (permBit === null) return { hasAllow: false, hasDeny: false };
  const allowBits = BigInt(overwrite.allow);
  const denyBits = BigInt(overwrite.deny);
  return {
    hasAllow: (allowBits & permBit) === permBit,
    hasDeny: (denyBits & permBit) === permBit
  };
}
function permissionToBigInt(perm) {
  const map = {
    ViewChannel: 1n << 10n,
    SendMessages: 1n << 11n,
    SendMessagesInThreads: 1n << 38n,
    ReadMessageHistory: 1n << 16n,
    EmbedLinks: 1n << 14n,
    AttachFiles: 1n << 15n,
    AddReactions: 1n << 6n,
    UseExternalEmojis: 1n << 18n,
    Connect: 1n << 20n,
    Speak: 1n << 21n,
    UseVAD: 1n << 25n,
    ManageChannels: 1n << 4n,
    ManageRoles: 1n << 3n
  };
  return map[perm] ?? null;
}
function evaluateRule(rule, guildState, protectedChannels, protectedCategories, exemptChannels, exemptCategories) {
  if (!rule.enabled) return null;
  switch (rule.type) {
    case "channel_type":
      return evaluateChannelTypeRule(rule, guildState, exemptChannels);
    case "channel_permission":
      return evaluateChannelPermissionRule(rule, guildState, protectedChannels, exemptChannels);
    case "category_protected":
      return evaluateCategoryProtectedRule(rule, guildState, protectedCategories);
    case "required_channel":
      return evaluateRequiredChannelRule(rule, guildState);
    case "required_category":
      return evaluateRequiredCategoryRule(rule, guildState);
    case "channel_restricted":
      return evaluateChannelRestrictedRule(rule, guildState, exemptChannels);
    default:
      return null;
  }
}
function evaluateChannelTypeRule(rule, guildState, exemptChannels) {
  if (!rule.channelPattern || !rule.expectedType) return null;
  const matchingChannels = guildState.channels.filter(
    (ch) => channelMatchesPattern(ch, rule.channelPattern) && !exemptChannels.includes(ch.id)
  );
  if (matchingChannels.length === 0) {
    if (rule.type === "required_channel") {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "medium",
        message: `No channels matching "${rule.channelPattern}" found`,
        expected: rule.expectedType,
        actual: "none"
      };
    }
    return null;
  }
  for (const ch of matchingChannels) {
    const actualKind = getChannelKind(ch.type);
    if (actualKind !== rule.expectedType) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "low",
        channelId: ch.id,
        message: `#${ch.name} expected to be ${rule.expectedType} but is ${actualKind}`,
        expected: rule.expectedType,
        actual: actualKind
      };
    }
  }
  return {
    ruleId: rule.id,
    ruleType: rule.type,
    channelId: matchingChannels[0]?.id,
    message: `All channels matching "${rule.channelPattern}" have correct type`
  };
}
function evaluateChannelPermissionRule(rule, guildState, protectedChannels, exemptChannels) {
  if (!rule.channelPattern || !rule.permission || !rule.permissionOp) return null;
  const matchingChannels = guildState.channels.filter(
    (ch) => channelMatchesPattern(ch, rule.channelPattern) && !exemptChannels.includes(ch.id)
  );
  for (const ch of matchingChannels) {
    const { hasAllow, hasDeny } = checkPermissionOverwrite(
      ch,
      guildState.everyoneRoleId,
      rule.permission
    );
    let violated = false;
    let actualState = "neutral";
    switch (rule.permissionOp) {
      case "must_allow":
        if (!hasAllow) {
          violated = true;
          actualState = hasDeny ? "denied" : "neutral";
        }
        break;
      case "must_deny":
        if (!hasDeny) {
          violated = true;
          actualState = hasAllow ? "allowed" : "neutral";
        }
        break;
      case "allow":
        if (hasDeny) {
          violated = true;
          actualState = "denied";
        }
        break;
      case "deny":
        if (hasAllow) {
          violated = true;
          actualState = "allowed";
        }
        break;
    }
    if (violated) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "medium",
        channelId: ch.id,
        message: `#${ch.name}: @everyone ${rule.permission} should be ${rule.permissionOp} but is ${actualState}`,
        expected: rule.permissionOp,
        actual: actualState
      };
    }
  }
  return {
    ruleId: rule.id,
    ruleType: rule.type,
    channelId: matchingChannels[0]?.id,
    message: `All channels matching "${rule.channelPattern}" satisfy ${rule.permission} = ${rule.permissionOp}`
  };
}
function evaluateCategoryProtectedRule(rule, guildState, protectedCategories) {
  if (!rule.categoryPattern) return null;
  const matchingCategories = guildState.categories.filter(
    (cat) => categoryMatchesPattern(cat, rule.categoryPattern)
  );
  for (const cat of matchingCategories) {
    if (!protectedCategories.includes(cat.id)) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "high",
        categoryName: cat.id,
        message: `Category "${cat.name}" should be protected but is not`,
        expected: "protected",
        actual: "unprotected"
      };
    }
  }
  return {
    ruleId: rule.id,
    ruleType: rule.type,
    categoryName: matchingCategories[0]?.id,
    message: `Categories matching "${rule.categoryPattern}" are protected`
  };
}
function evaluateRequiredChannelRule(rule, guildState) {
  if (!rule.requiredName) return null;
  const found = guildState.channels.some(
    (ch) => ch.name.toLowerCase() === rule.requiredName.toLowerCase()
  );
  if (!found) {
    return {
      ruleId: rule.id,
      ruleType: rule.type,
      severity: rule.riskIfViolated || "medium",
      message: `Required channel "#${rule.requiredName}" is missing`,
      expected: "present",
      actual: "missing"
    };
  }
  return {
    ruleId: rule.id,
    ruleType: rule.type,
    message: `Required channel "#${rule.requiredName}" exists`
  };
}
function evaluateRequiredCategoryRule(rule, guildState) {
  if (!rule.requiredName) return null;
  const found = guildState.categories.some(
    (cat) => cat.name.toLowerCase() === rule.requiredName.toLowerCase()
  );
  if (!found) {
    return {
      ruleId: rule.id,
      ruleType: rule.type,
      severity: rule.riskIfViolated || "medium",
      message: `Required category "${rule.requiredName}" is missing`,
      expected: "present",
      actual: "missing"
    };
  }
  return {
    ruleId: rule.id,
    ruleType: rule.type,
    message: `Required category "${rule.requiredName}" exists`
  };
}
function evaluateChannelRestrictedRule(rule, guildState, exemptChannels) {
  if (!rule.channelPattern || !rule.permission) return null;
  const matchingChannels = guildState.channels.filter(
    (ch) => channelMatchesPattern(ch, rule.channelPattern) && !exemptChannels.includes(ch.id)
  );
  for (const ch of matchingChannels) {
    const { hasAllow } = checkPermissionOverwrite(
      ch,
      guildState.everyoneRoleId,
      rule.permission
    );
    if (hasAllow) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "medium",
        channelId: ch.id,
        message: `#${ch.name}: @everyone should not have ${rule.permission}`,
        expected: "not allowed",
        actual: "allowed"
      };
    }
  }
  return {
    ruleId: rule.id,
    ruleType: rule.type,
    channelId: matchingChannels[0]?.id,
    message: `Channels matching "${rule.channelPattern}" correctly restrict ${rule.permission}`
  };
}
function inspectPolicy(policy, guildState) {
  const violations = [];
  const compliant = [];
  for (const rule of policy.rules) {
    const result = evaluateRule(
      rule,
      guildState,
      policy.protectedChannels,
      policy.protectedCategories,
      policy.exemptChannels,
      policy.exemptCategories
    );
    if (!result) continue;
    if ("severity" in result && "expected" in result) {
      violations.push(result);
    } else {
      compliant.push(result);
    }
  }
  const criticalViolations = violations.filter((v) => v.severity === "critical").length;
  let status = "compliant";
  if (criticalViolations > 0) status = "violation";
  else if (violations.length > 0) status = "violation";
  return {
    policyId: policy.id,
    guildId: policy.guildId,
    policyName: policy.name,
    timestamp: Date.now(),
    status,
    violations,
    compliant,
    protectedResources: {
      channels: [...policy.protectedChannels],
      categories: [...policy.protectedCategories]
    },
    totalRulesEvaluated: policy.rules.filter((r) => r.enabled).length,
    totalViolations: violations.length,
    criticalViolations
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deletePolicyConfig,
  evaluateRule,
  generateRuleId,
  hasPolicy,
  inspectPolicy,
  loadPolicyConfig,
  matchesPattern,
  savePolicyConfig,
  validatePolicyConfig,
  validateRule
});
