import type { Client } from "discord.js";
import { logger } from "../../../logger";
import { recordAudit } from "../../../security/audit";

/* ================================================================
 * UNDO MANAGER
 *
 * Records inverse actions for supported operations so they can
 * be individually reversed. This is NOT the same as backup restore.
 *
 * Supported undo operations:
 * - create_channel → delete channel
 * - create_category → delete category
 * - rename_channel → restore old name
 * - create_role → delete role
 * - assign_role → remove role
 * - remove_role → assign role
 * ================================================================ */

export interface UndoEntry {
  id: string;
  guildId: string;
  userId: string;
  toolName: string;
  description: string;
  createdAt: number;
  expiresAt: number;
  /** The inverse operation to execute */
  inverse: UndoAction;
}

export interface UndoAction {
  type: "delete_channel" | "delete_category" | "rename_channel" | "delete_role" | "assign_role" | "remove_role" | "restore_permissions";
  targetId: string;
  /** Extra data needed for the inverse operation */
  data: Record<string, unknown>;
}

const undoStack = new Map<string, UndoEntry>();
const UNDO_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_UNDO_ENTRIES = 100;

let undoCounter = 0;

/* ================================================================
 * RECORD UNDO
 * ================================================================ */

export function recordUndo(
  guildId: string,
  userId: string,
  toolName: string,
  description: string,
  inverse: UndoAction,
): string {
  const id = `undo_${Date.now().toString(36)}_${++undoCounter}`;

  const entry: UndoEntry = {
    id,
    guildId,
    userId,
    toolName,
    description,
    createdAt: Date.now(),
    expiresAt: Date.now() + UNDO_TTL_MS,
    inverse,
  };

  undoStack.set(id, entry);

  // Cleanup old entries
  if (undoStack.size > MAX_UNDO_ENTRIES) {
    const oldest = [...undoStack.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, undoStack.size - MAX_UNDO_ENTRIES);

    for (const [key] of oldest) {
      undoStack.delete(key);
    }
  }

  logger.info(`Undo recorded: ${id} tool=${toolName} guild=${guildId}`);
  return id;
}

/* ================================================================
 * GET LAST UNDO FOR USER
 * ================================================================ */

export function getLastUndoForUser(guildId: string, userId: string): UndoEntry | undefined {
  const entries = [...undoStack.values()]
    .filter((e) => e.guildId === guildId && e.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);

  return entries[0];
}

/* ================================================================
 * GET UNDO BY ID
 * ================================================================ */

export function getUndoEntry(undoId: string): UndoEntry | undefined {
  return undoStack.get(undoId);
}

/* ================================================================
 * REMOVE UNDO
 * ================================================================ */

export function removeUndo(undoId: string): boolean {
  return undoStack.delete(undoId);
}

/* ================================================================
 * EXECUTE UNDO
 * ================================================================ */

export async function executeUndo(
  undoId: string,
  getClient: () => Client | null,
): Promise<{ success: boolean; message: string }> {
  const entry = undoStack.get(undoId);
  if (!entry) {
    return { success: false, message: "❌ Undo entry not found or expired." };
  }

  if (Date.now() > entry.expiresAt) {
    undoStack.delete(undoId);
    return { success: false, message: "❌ This undo has expired (30 minute limit)." };
  }

  const client = getClient();
  if (!client) {
    return { success: false, message: "❌ Discord client is not connected." };
  }

  const guild = await client.guilds.fetch(entry.guildId).catch(() => null);
  if (!guild) {
    return { success: false, message: "❌ Could not fetch guild." };
  }

  try {
    const action = entry.inverse;

    switch (action.type) {
      case "delete_channel": {
        const channel = guild.channels.cache.get(action.targetId);
        if (!channel) {
          return { success: false, message: "❌ Channel no longer exists." };
        }
        await channel.delete("Undo: " + entry.description);
        break;
      }

      case "delete_category": {
        const category = guild.channels.cache.get(action.targetId);
        if (!category) {
          return { success: false, message: "❌ Category no longer exists." };
        }
        await category.delete("Undo: " + entry.description);
        break;
      }

      case "rename_channel": {
        const channel = guild.channels.cache.get(action.targetId);
        if (!channel) {
          return { success: false, message: "❌ Channel no longer exists." };
        }
        const oldName = action.data.oldName as string;
        if (!oldName) {
          return { success: false, message: "❌ Cannot undo: original name not recorded." };
        }
        await channel.setName(oldName, "Undo: " + entry.description);
        break;
      }

      case "delete_role": {
        const role = guild.roles.cache.get(action.targetId);
        if (!role) {
          return { success: false, message: "❌ Role no longer exists." };
        }
        await role.delete("Undo: " + entry.description);
        break;
      }

      case "assign_role": {
        const userId = action.data.userId as string;
        const roleId = action.data.roleId as string;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          return { success: false, message: "❌ User no longer in server." };
        }
        await member.roles.add(roleId, "Undo: " + entry.description);
        break;
      }

      case "remove_role": {
        const userId = action.data.userId as string;
        const roleId = action.data.roleId as string;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          return { success: false, message: "❌ User no longer in server." };
        }
        await member.roles.remove(roleId, "Undo: " + entry.description);
        break;
      }

      case "restore_permissions": {
        const channelId = action.targetId;
        const channel = guild.channels.cache.get(channelId);
        if (!channel || !("permissionOverwrites" in channel)) {
          return { success: false, message: "❌ Channel no longer exists or does not support permission overwrites." };
        }
        const oldOverwrites = action.data.oldOverwrites as Array<{
          id: string;
          allow: bigint[];
          deny: bigint[];
        }>;
        if (!oldOverwrites) {
          return { success: false, message: "❌ Cannot undo: original permissions not recorded." };
        }
        // Clear current overwrites and restore old ones
        await channel.permissionOverwrites.set(
          oldOverwrites.map((o) => ({
            id: o.id,
            allow: o.allow,
            deny: o.deny,
          })),
          "Undo: " + entry.description,
        );
        break;
      }

      default:
        return { success: false, message: "❌ Unknown undo action type." };
    }

    // Remove the undo entry after successful execution
    undoStack.delete(undoId);

    recordAudit({
      who: entry.userId,
      whoName: "undo",
      what: `Undo: ${entry.description}`,
      where: "undo-manager",
      guildId: entry.guildId,
      result: "success",
    });

    return {
      success: true,
      message: `✅ **Undone:** ${entry.description}`,
    };
  } catch (error) {
    logger.error(`Undo execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      message: "❌ Undo failed. The issue has been logged.",
    };
  }
}

/* ================================================================
 * CLEANUP EXPIRED
 * ================================================================ */

export function cleanupExpiredUndos(): void {
  const now = Date.now();
  for (const [id, entry] of undoStack) {
    if (now > entry.expiresAt) {
      undoStack.delete(id);
    }
  }
}

// Auto-cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupExpiredUndos, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();
