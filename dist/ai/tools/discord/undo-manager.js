"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var undo_manager_exports = {};
__export(undo_manager_exports, {
  cleanupExpiredUndos: () => cleanupExpiredUndos,
  executeUndo: () => executeUndo,
  getLastUndoForUser: () => getLastUndoForUser,
  getUndoEntry: () => getUndoEntry,
  recordUndo: () => recordUndo,
  removeUndo: () => removeUndo
});
module.exports = __toCommonJS(undo_manager_exports);
var import_logger = require("../../../logger");
var import_audit = require("../../../security/audit");
const undoStack = /* @__PURE__ */ new Map();
const UNDO_TTL_MS = 30 * 60 * 1e3;
const MAX_UNDO_ENTRIES = 100;
let undoCounter = 0;
function recordUndo(guildId, userId, toolName, description, inverse) {
  const id = `undo_${Date.now().toString(36)}_${++undoCounter}`;
  const entry = {
    id,
    guildId,
    userId,
    toolName,
    description,
    createdAt: Date.now(),
    expiresAt: Date.now() + UNDO_TTL_MS,
    inverse
  };
  undoStack.set(id, entry);
  if (undoStack.size > MAX_UNDO_ENTRIES) {
    const oldest = [...undoStack.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt).slice(0, undoStack.size - MAX_UNDO_ENTRIES);
    for (const [key] of oldest) {
      undoStack.delete(key);
    }
  }
  import_logger.logger.info(`Undo recorded: ${id} tool=${toolName} guild=${guildId}`);
  return id;
}
function getLastUndoForUser(guildId, userId) {
  const entries = [...undoStack.values()].filter((e) => e.guildId === guildId && e.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  return entries[0];
}
function getUndoEntry(undoId) {
  return undoStack.get(undoId);
}
function removeUndo(undoId) {
  return undoStack.delete(undoId);
}
async function executeUndo(undoId, getClient) {
  const entry = undoStack.get(undoId);
  if (!entry) {
    return { success: false, message: "\u274C Undo entry not found or expired." };
  }
  if (Date.now() > entry.expiresAt) {
    undoStack.delete(undoId);
    return { success: false, message: "\u274C This undo has expired (30 minute limit)." };
  }
  const client = getClient();
  if (!client) {
    return { success: false, message: "\u274C Discord client is not connected." };
  }
  const guild = await client.guilds.fetch(entry.guildId).catch(() => null);
  if (!guild) {
    return { success: false, message: "\u274C Could not fetch guild." };
  }
  try {
    const action = entry.inverse;
    switch (action.type) {
      case "delete_channel": {
        const channel = guild.channels.cache.get(action.targetId);
        if (!channel) {
          return { success: false, message: "\u274C Channel no longer exists." };
        }
        await channel.delete("Undo: " + entry.description);
        break;
      }
      case "delete_category": {
        const category = guild.channels.cache.get(action.targetId);
        if (!category) {
          return { success: false, message: "\u274C Category no longer exists." };
        }
        await category.delete("Undo: " + entry.description);
        break;
      }
      case "rename_channel": {
        const channel = guild.channels.cache.get(action.targetId);
        if (!channel) {
          return { success: false, message: "\u274C Channel no longer exists." };
        }
        const oldName = action.data.oldName;
        if (!oldName) {
          return { success: false, message: "\u274C Cannot undo: original name not recorded." };
        }
        await channel.setName(oldName, "Undo: " + entry.description);
        break;
      }
      case "delete_role": {
        const role = guild.roles.cache.get(action.targetId);
        if (!role) {
          return { success: false, message: "\u274C Role no longer exists." };
        }
        await role.delete("Undo: " + entry.description);
        break;
      }
      case "assign_role": {
        const userId = action.data.userId;
        const roleId = action.data.roleId;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          return { success: false, message: "\u274C User no longer in server." };
        }
        await member.roles.add(roleId, "Undo: " + entry.description);
        break;
      }
      case "remove_role": {
        const userId = action.data.userId;
        const roleId = action.data.roleId;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          return { success: false, message: "\u274C User no longer in server." };
        }
        await member.roles.remove(roleId, "Undo: " + entry.description);
        break;
      }
      case "restore_permissions": {
        const channelId = action.targetId;
        const channel = guild.channels.cache.get(channelId);
        if (!channel || !("permissionOverwrites" in channel)) {
          return { success: false, message: "\u274C Channel no longer exists or does not support permission overwrites." };
        }
        const oldOverwrites = action.data.oldOverwrites;
        if (!oldOverwrites) {
          return { success: false, message: "\u274C Cannot undo: original permissions not recorded." };
        }
        await channel.permissionOverwrites.set(
          oldOverwrites.map((o) => ({
            id: o.id,
            allow: o.allow,
            deny: o.deny
          })),
          "Undo: " + entry.description
        );
        break;
      }
      default:
        return { success: false, message: "\u274C Unknown undo action type." };
    }
    undoStack.delete(undoId);
    (0, import_audit.recordAudit)({
      who: entry.userId,
      whoName: "undo",
      what: `Undo: ${entry.description}`,
      where: "undo-manager",
      guildId: entry.guildId,
      result: "success"
    });
    return {
      success: true,
      message: `\u2705 **Undone:** ${entry.description}`
    };
  } catch (error) {
    import_logger.logger.error(`Undo execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      message: "\u274C Undo failed. The issue has been logged."
    };
  }
}
function cleanupExpiredUndos() {
  const now = Date.now();
  for (const [id, entry] of undoStack) {
    if (now > entry.expiresAt) {
      undoStack.delete(id);
    }
  }
}
const cleanupInterval = setInterval(cleanupExpiredUndos, 5 * 60 * 1e3);
if (cleanupInterval.unref) cleanupInterval.unref();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupExpiredUndos,
  executeUndo,
  getLastUndoForUser,
  getUndoEntry,
  recordUndo,
  removeUndo
});
