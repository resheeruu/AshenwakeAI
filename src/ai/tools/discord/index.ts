/**
 * Discord tools — U3 (read-only) + U4 (write) + U5 (management) + U6 (protection) + U7 (governance) barrel exports.
 *
 * Use `createDiscordTools(getClient)` for all tools.
 * Use `createReadOnlyDiscordTools(getClient)` for U3 only.
 * Use `createWriteDiscordTools(getClient)` for U4 only.
 * Use `createManagementDiscordTools(getClient)` for U5 only.
 * Use `createProtectionDiscordTools(getClient)` for U6 only.
 * Use `createGovernanceTools(getClient)` for U7 only.
 */

import type { Client } from "discord.js";
import type { ToolDefinition } from "../types";

// U3 — Read-only
import { createInspectServerTool } from "./inspect-server";
import { createListChannelsTool } from "./list-channels";
import { createCheckPermissionsTool } from "./check-permissions";
import { createInspectAIConfigTool } from "./inspect-ai-config";
import { createHealthCheckTool } from "./health-check";

// U4 — Write (channel creation/rename/move)
import { createCreateChannelTool } from "./create-channel";
import { createCreateCategoryTool } from "./create-category";
import { createRenameChannelTool } from "./rename-channel";
import { createMoveChannelTool } from "./move-channel";

// U5 — Management (edit/delete/permissions)
import { createChannelManagementTools } from "./channels";

// U6 — Protection + Presets + Audit
import {
  createProtectChannelTool,
  createUnprotectChannelTool,
  createProtectCategoryTool,
  createUnprotectCategoryTool,
  createListProtectedResourcesTool,
} from "./protection-tools";
import { createViewToolAuditTool } from "./audit-viewer";
import { createPermissionPresetTools } from "./channels";

// U7 — Governance
import { createGovernanceTools } from "../governance";

export type { ServerInfo, ChannelInfo, PermissionReport, AIConfigInfo, HealthReport, PermissionSet, SubsystemHealth, HealthStatus, ChannelType } from "./types";

// U4 execution functions
export { executeCreateChannel } from "./create-channel";
export { executeCreateCategory } from "./create-category";
export { executeRenameChannel } from "./rename-channel";
export { executeMoveChannel } from "./move-channel";

// U5 execution functions
export { executeEditChannel } from "./channels";
export { executeDeleteChannel } from "./channels";
export { executeDeleteCategory } from "./channels";
export { executeManageChannelPermissions } from "./channels";

// U6 execution functions
export { executeProtectChannel, executeUnprotectChannel, executeProtectCategory, executeUnprotectCategory } from "./protection-tools";
export { executeApplyChannelPreset } from "./channels";

/**
 * Create all Discord tools (U3 + U4 + U5 + U6 + U7).
 */
export function createDiscordTools(getClient: () => Client | null): ToolDefinition[] {
  return [
    ...createReadOnlyDiscordTools(getClient),
    ...createWriteDiscordTools(getClient),
    ...createManagementDiscordTools(getClient),
    ...createProtectionDiscordTools(getClient),
    ...createGovernanceTools(getClient),
  ];
}

/**
 * Create U3 read-only Discord tools only.
 */
export function createReadOnlyDiscordTools(getClient: () => Client | null): ToolDefinition[] {
  return [
    createInspectServerTool(getClient),
    createListChannelsTool(getClient),
    createCheckPermissionsTool(getClient),
    createInspectAIConfigTool(),
    createHealthCheckTool(),
  ];
}

/**
 * Create U4 write Discord tools only (create/rename/move).
 */
export function createWriteDiscordTools(getClient: () => Client | null): ToolDefinition[] {
  return [
    createCreateChannelTool(getClient),
    createCreateCategoryTool(getClient),
    createRenameChannelTool(getClient),
    createMoveChannelTool(getClient),
  ];
}

/**
 * Create U5 management Discord tools only (edit/delete/permissions).
 */
export function createManagementDiscordTools(getClient: () => Client | null): ToolDefinition[] {
  return createChannelManagementTools(getClient);
}

/**
 * Create U6 protection + preset + audit Discord tools.
 */
export function createProtectionDiscordTools(getClient: () => Client | null): ToolDefinition[] {
  return [
    createProtectChannelTool(getClient),
    createUnprotectChannelTool(getClient),
    createProtectCategoryTool(getClient),
    createUnprotectCategoryTool(getClient),
    createListProtectedResourcesTool(getClient),
    ...createPermissionPresetTools(getClient),
    createViewToolAuditTool(getClient),
  ];
}
