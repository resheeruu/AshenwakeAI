import type { GuildConfig } from "../core/guild-config";

export type SettingType = "boolean" | "channel" | "role" | "number" | "roles";

export type ChannelTypeFilter = "Text" | "Voice" | "Category" | "Announcement" | "Stage";

export interface SettingDescriptor {
  id: string;
  label: string;
  description: string;
  type: SettingType;
  category: SettingsCategory;
  /** Dot-path into GuildConfig, e.g. "moderation.enabled" or "support.channelId" */
  path: string;
  /** Default value used when the section doesn't exist yet */
  defaultValue: unknown;
  /** For numbers: min/max bounds */
  min?: number;
  max?: number;
  /** For channels: allowed Discord channel types */
  channelTypes?: ChannelTypeFilter[];
  /** For roles: reject managed/@everyone */
  rejectManaged?: boolean;
  /** Whether this setting requires confirmation before saving */
  requiresConfirmation?: boolean;
}

export type SettingsCategory =
  | "overview"
  | "moderation"
  | "support"
  | "reports"
  | "appeals"
  | "ai"
  | "logging"
  | "staff"
  | "audit";

export interface SettingsCategoryMeta {
  id: SettingsCategory;
  label: string;
  emoji: string;
}

export interface SettingChange {
  settingId: string;
  category: SettingsCategory;
  path: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
  guildId: string;
  userId: string;
  userName: string;
  timestamp: number;
}

/** Result of a setting validation */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  normalized?: unknown;
}

/** Panel session state for scoping interactions */
export interface PanelSession {
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  createdAt: number;
  currentCategory: SettingsCategory;
}

/** Extract a nested value from a GuildConfig by dot-path */
export function getConfigValue(config: GuildConfig, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Set a nested value on a GuildConfig by dot-path (mutates in place) */
export function setConfigValue(
  config: GuildConfig,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] == null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/** Ensure a section exists on the config, returning it (creates with defaults if missing) */
export function ensureSection<T>(
  config: GuildConfig,
  sectionPath: string,
  defaults: T,
): T {
  const parts = sectionPath.split(".");
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (const part of parts) {
    if (current[part] == null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const section = current as unknown as T;
  return section;
}
