/**
 * U5 channel management tools + U6 permission presets barrel exports.
 */

import type { Client } from "discord.js";
import type { ToolDefinition } from "../../types";

import { createEditChannelTool } from "./edit-channel";
import { createDeleteChannelTool } from "./delete-channel";
import { createDeleteCategoryTool } from "./delete-category";
import { createManageChannelPermissionsTool } from "./permissions";
import { createApplyChannelPresetTool } from "./permission-presets";

export { executeEditChannel } from "./edit-channel";
export { executeDeleteChannel } from "./delete-channel";
export { executeDeleteCategory } from "./delete-category";
export { executeManageChannelPermissions } from "./permissions";
export { executeApplyChannelPreset } from "./permission-presets";

/**
 * Create U5 channel management tools.
 */
export function createChannelManagementTools(getClient: () => Client | null): ToolDefinition[] {
  return [
    createEditChannelTool(getClient),
    createDeleteChannelTool(getClient),
    createDeleteCategoryTool(getClient),
    createManageChannelPermissionsTool(getClient),
  ];
}

/**
 * Create U6 permission preset tools.
 */
export function createPermissionPresetTools(getClient: () => Client | null): ToolDefinition[] {
  return [
    createApplyChannelPresetTool(getClient),
  ];
}
