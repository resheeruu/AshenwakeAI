/**
 * Normalized data structures for Discord read-only tools.
 *
 * These prevent raw Discord.js objects from leaking into the AI layer.
 * All fields are intentionally selected — no tokens, no env vars, no internals.
 */

/* ================================================================
 * SERVER INFO
 * ================================================================ */

export interface ServerInfo {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
  botCount: number;
  roleCount: number;
  channelCount: number;
  categoryCount: number;
  textChannelCount: number;
  voiceChannelCount: number;
  forumChannelCount: number;
  boostLevel: number;
  verificationLevel: string;
  aiEnabled: boolean;
  aiManagementEnabled: boolean;
  aiManagementChannels: string[];
  aiChatChannels: string[];
}

/* ================================================================
 * CHANNEL INFO
 * ================================================================ */

export type ChannelType = "text" | "voice" | "category" | "forum" | "unknown";

export interface ChannelInfo {
  id: string;
  name: string;
  type: ChannelType;
  categoryId: string | null;
  categoryName: string | null;
  position: number;
  aiScopes: string[];
  isManagedByBot: boolean;
}

/* ================================================================
 * PERMISSION INFO
 * ================================================================ */

export interface PermissionSet {
  viewChannel: boolean;
  sendMessages: boolean;
  embedLinks: boolean;
  manageChannels: boolean;
  manageRoles: boolean;
  manageMessages: boolean;
  moderateMembers: boolean;
  moveMembers: boolean;
  connect: boolean;
  speak: boolean;
}

export interface PermissionReport {
  user: {
    applicationRole: string;
    discordPermissions: PermissionSet;
  };
  bot: {
    discordPermissions: PermissionSet;
  };
  summary: {
    canCreateChannels: boolean;
    canManageRoles: boolean;
    canTimeoutMembers: boolean;
    canDeleteMessages: boolean;
    canMoveMembers: boolean;
  };
}

/* ================================================================
 * AI CONFIG INFO
 * ================================================================ */

export interface AIConfigInfo {
  enabled: boolean;
  managementEnabled: boolean;
  channelScopes: Record<string, string[]>;
  managementRoleCount: number;
  chatRoleCount: number;
  version: number;
}

/* ================================================================
 * HEALTH INFO
 * ================================================================ */

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface SubsystemHealth {
  name: string;
  status: HealthStatus;
  message: string;
}

export interface HealthReport {
  overall: HealthStatus;
  subsystems: SubsystemHealth[];
}
