import { loadGuildConfig, saveGuildConfig, type GuildConfig } from "../core/guild-config";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";
import { getRecentLogs } from "../log-stream";
import { getAuditLog } from "../security/audit";
import { ALL_SETTINGS, getSettingById, getSettingsByCategory } from "./definitions";
import type {
  SettingDescriptor,
  SettingChange,
  ValidationResult,
  SettingsCategory,
} from "./types";
import { getConfigValue, setConfigValue } from "./types";

/* ================================================================
 * VALIDATION
 * ================================================================ */

const DISCORD_ID_RE = /^\d{17,20}$/;

export function validateSettingValue(
  descriptor: SettingDescriptor,
  rawValue: string,
  guildId: string,
): ValidationResult {
  switch (descriptor.type) {
    case "boolean": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "true" || lower === "1" || lower === "yes" || lower === "on") {
        return { valid: true, normalized: true };
      }
      if (lower === "false" || lower === "0" || lower === "no" || lower === "off") {
        return { valid: true, normalized: false };
      }
      if (lower === "none" || lower === "unset" || lower === "reset") {
        return { valid: true, normalized: descriptor.defaultValue };
      }
      return { valid: false, error: `Expected true/false, got "${rawValue}"` };
    }

    case "number": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "none" || lower === "unset" || lower === "reset") {
        return { valid: true, normalized: descriptor.defaultValue };
      }
      const num = Number(rawValue);
      if (!Number.isFinite(num) || !Number.isInteger(num)) {
        return { valid: false, error: `Expected a whole number, got "${rawValue}"` };
      }
      if (descriptor.min !== undefined && num < descriptor.min) {
        return { valid: false, error: `Minimum value is ${descriptor.min}` };
      }
      if (descriptor.max !== undefined && num > descriptor.max) {
        return { valid: false, error: `Maximum value is ${descriptor.max}` };
      }
      return { valid: true, normalized: num };
    }

    case "channel": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "none" || lower === "unset" || lower === "reset" || lower === "clear") {
        return { valid: true, normalized: undefined };
      }
      if (!DISCORD_ID_RE.test(rawValue)) {
        return { valid: false, error: `Invalid channel ID format: "${rawValue}"` };
      }
      return { valid: true, normalized: rawValue };
    }

    case "role": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "none" || lower === "unset" || lower === "reset" || lower === "clear") {
        return { valid: true, normalized: undefined };
      }
      if (!DISCORD_ID_RE.test(rawValue)) {
        return { valid: false, error: `Invalid role ID format: "${rawValue}"` };
      }
      return { valid: true, normalized: rawValue };
    }

    case "roles": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "none" || lower === "unset" || lower === "reset" || lower === "clear") {
        return { valid: true, normalized: [] };
      }
      if (!DISCORD_ID_RE.test(rawValue)) {
        return { valid: false, error: `Invalid role ID format: "${rawValue}"` };
      }
      return { valid: true, normalized: rawValue };
    }

    case "string": {
      const trimmed = rawValue.trim();
      if (trimmed === "none" || trimmed === "unset" || trimmed === "reset") {
        return { valid: true, normalized: descriptor.defaultValue };
      }
      if (trimmed.length === 0) {
        return { valid: false, error: `String value cannot be empty` };
      }
      if (descriptor.max !== undefined && trimmed.length > descriptor.max) {
        return { valid: false, error: `Maximum length is ${descriptor.max} characters` };
      }
      if (descriptor.min !== undefined && trimmed.length < descriptor.min) {
        return { valid: false, error: `Minimum length is ${descriptor.min} characters` };
      }
      return { valid: true, normalized: trimmed };
    }

    default:
      return { valid: false, error: `Unknown setting type: "${descriptor.type}"` };
  }
}

/* ================================================================
 * GET / SET / RESET
 * ================================================================ */

/** Get the current value of a setting from guild config */
export function getSettingValue(
  config: GuildConfig,
  settingId: string,
): unknown {
  const descriptor = getSettingById(settingId);
  if (!descriptor) return undefined;
  return getConfigValue(config, descriptor.path);
}

/** Get all setting values for a category */
export function getCategoryValues(
  config: GuildConfig,
  category: SettingsCategory,
): Map<string, unknown> {
  const settings = getSettingsByCategory(category);
  const values = new Map<string, unknown>();
  for (const setting of settings) {
    values.set(setting.id, getConfigValue(config, setting.path));
  }
  return values;
}

/** Apply a setting change to a config (mutates in place) */
export function applySettingChange(
  config: GuildConfig,
  settingId: string,
  newValue: unknown,
): SettingChange | null {
  const descriptor = getSettingById(settingId);
  if (!descriptor) return null;

  const oldValue = getConfigValue(config, descriptor.path);
  setConfigValue(config, descriptor.path, newValue);

  return {
    settingId,
    category: descriptor.category,
    path: descriptor.path,
    label: descriptor.label,
    oldValue,
    newValue,
    guildId: config.guildId,
    userId: "",
    userName: "",
    timestamp: Date.now(),
  };
}

/** Save config and record audit for a setting change */
export function saveSettingChange(
  config: GuildConfig,
  change: SettingChange,
  userId: string,
  userName: string,
): void {
  change.userId = userId;
  change.userName = userName;
  change.timestamp = Date.now();

  saveGuildConfig(config);

  const details = `${change.label}: ${formatValue(change.oldValue)} → ${formatValue(change.newValue)}`;

  recordAudit({
    who: userId,
    whoName: userName,
    what: `Settings updated: ${details}`,
    where: "discord",
    guildId: config.guildId,
    result: "success",
  });

  logger.info(`⚙️ Settings updated by ${userName}: ${change.path} = ${formatValue(change.newValue)}`);
}

/**
 * Read a setting value from config.
 * If newValue is provided, also sets it.
 * Returns the old value (before any set).
 */
export function applySettingValue(
  config: GuildConfig,
  settingId: string,
  newValue?: unknown,
): unknown {
  const descriptor = getSettingById(settingId);
  if (!descriptor) return null;
  const oldValue = getConfigValue(config, descriptor.path);
  if (newValue !== undefined) {
    setConfigValue(config, descriptor.path, newValue);
  }
  return oldValue;
}

/** Reset a setting to its default value */
export function resetSetting(
  config: GuildConfig,
  settingId: string,
): SettingChange | null {
  const descriptor = getSettingById(settingId);
  if (!descriptor) return null;
  return applySettingChange(config, settingId, descriptor.defaultValue);
}

/* ================================================================
 * OVERVIEW / AUDIT / LOGS
 * ================================================================ */

export interface OverviewData {
  enabledModules: string[];
  configuredChannels: { label: string; id: string | undefined }[];
  staffRoles: string[];
  loggingEnabled: boolean;
  lastConfigChange: number | undefined;
}

export function getOverviewData(config: GuildConfig): OverviewData {
  const enabledModules: string[] = [];
  if (config.moderation?.enabled) enabledModules.push("Moderation");
  if (config.support?.enabled) enabledModules.push("Support");
  if (config.reports?.enabled) enabledModules.push("Reports");
  if (config.appeals?.enabled) enabledModules.push("Appeals");
  if (config.supportAi?.enabled) enabledModules.push("AI");
  if (config.supportLogging?.enabled) enabledModules.push("Logging");

  const configuredChannels: { label: string; id: string | undefined }[] = [];
  if (config.support?.channelId) configuredChannels.push({ label: "Support Channel", id: config.support.channelId });
  if (config.support?.categoryId) configuredChannels.push({ label: "Support Category", id: config.support.categoryId });
  if (config.reports?.categoryId) configuredChannels.push({ label: "Report Category", id: config.reports.categoryId });
  if (config.appeals?.categoryId) configuredChannels.push({ label: "Appeal Category", id: config.appeals.categoryId });
  if (config.supportLogging?.channelId) configuredChannels.push({ label: "Log Channel", id: config.supportLogging.channelId });

  const staffRoles = config.staff?.roleIds ?? [];

  return {
    enabledModules,
    configuredChannels,
    staffRoles,
    loggingEnabled: config.supportLogging?.enabled ?? false,
    lastConfigChange: config.updatedAt,
  };
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  who: string;
  whoName?: string;
  what: string;
  result: string;
  details?: string;
}

export function getRecentAuditEntries(
  guildId: string,
  limit = 20,
): AuditLogEntry[] {
  const entries = getAuditLog({ guildId, limit });
  return entries.map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    who: e.who,
    whoName: e.whoName,
    what: e.what,
    result: e.result,
    details: e.details,
  }));
}

export interface LogStreamEntry {
  id: number;
  timestamp: string;
  level: string;
  message: string;
}

export function getRecentLogEntries(limit = 30): LogStreamEntry[] {
  return getRecentLogs(limit).map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    level: e.level,
    message: e.message,
  }));
}

/* ================================================================
 * HELPERS
 * ================================================================ */

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "Not set";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.map((v) => (typeof v === "string" ? v : String(v))).join(", ");
  }
  return String(value);
}

export function formatChannelMention(id: string | undefined): string {
  return id ? `<#${id}>` : "Not set";
}

export function formatRoleMention(id: string): string {
  return `<@&${id}>`;
}

export function ensureConfigSections(config: GuildConfig): void {
  if (!config.support) {
    config.support = {
      enabled: false,
      allowGeneralHelp: true,
      allowReports: true,
      allowAppeals: true,
    };
  }
  if (!config.reports) {
    config.reports = {
      enabled: false,
      requireEvidence: false,
      aiAnalysisEnabled: true,
      autoEscalateHighRisk: true,
    };
  }
  if (!config.appeals) {
    config.appeals = {
      enabled: false,
      aiAnalysisEnabled: true,
    };
  }
  if (!config.supportAi) {
    config.supportAi = {
      enabled: true,
      allowModerationActions: false,
      requireConfirmation: true,
      allowWebResearch: false,
    };
  }
  if (!config.supportLogging) {
    config.supportLogging = {
      enabled: false,
      includeModeration: true,
      includeTickets: true,
      includeReports: true,
      includeAppeals: true,
      includeAiActions: true,
    };
  }
  if (!config.staff) {
    config.staff = { roleIds: [] };
  }
}
