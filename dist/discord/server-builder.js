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
var server_builder_exports = {};
__export(server_builder_exports, {
  TEMPLATES: () => TEMPLATES,
  buildFromTemplate: () => buildFromTemplate,
  listTemplates: () => listTemplates
});
module.exports = __toCommonJS(server_builder_exports);
var import_discord = require("discord.js");
var import_audit = require("../security/audit");
var import_permissions = require("../security/permissions");
var import_env = require("../config/env");
const TEMPLATES = {
  gaming: {
    name: "Gaming Server",
    description: "A gaming community server with voice channels, game discussion, and LFG.",
    categories: [
      { name: "\u{1F4CB} INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "memes", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "\u{1F3AE} GAMING", channels: [{ name: "looking-for-group", type: "text" }, { name: "game-clips", type: "text" }, { name: "lfg-voice", type: "voice" }] },
      { name: "\u{1F50A} VOICE", channels: [{ name: "General Voice", type: "voice" }, { name: "Gaming Voice", type: "voice" }, { name: "AFK", type: "voice" }] }
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Member", color: "#0066ff" },
      { name: "Gamer", color: "#aa00ff" }
    ]
  },
  community: {
    name: "Community Server",
    description: "A general community server with discussions, events, and support.",
    categories: [
      { name: "\u{1F4CB} INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }, { name: "roles", type: "text" }] },
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "introductions", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "\u{1F3AF} TOPICS", channels: [{ name: "discussions", type: "text" }, { name: "suggestions", type: "text" }, { name: "events", type: "text" }] },
      { name: "\u{1F50A} VOICE", channels: [{ name: "General", type: "voice" }, { name: "Music", type: "voice" }] }
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Member", color: "#0066ff" }
    ]
  },
  minecraft: {
    name: "Minecraft Server",
    description: "A Minecraft community with build showcases, LFG, and server info.",
    categories: [
      { name: "\u{1F4CB} INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "server-info", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "screenshots", type: "text" }, { name: "builds", type: "text" }] },
      { name: "\u{1F3AE} MINECRAFT", channels: [{ name: "looking-for-group", type: "text" }, { name: "trading", type: "text" }, { name: "mc-voice", type: "voice" }] }
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Builder", color: "#aa8800" },
      { name: "Member", color: "#0066ff" }
    ]
  },
  support: {
    name: "Support Server",
    description: "A support/help desk server with ticketing and staff channels.",
    categories: [
      { name: "\u{1F4CB} INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "faq", type: "text" }] },
      { name: "\u{1F3AB} SUPPORT", channels: [{ name: "create-ticket", type: "text" }, { name: "faq", type: "text" }] },
      { name: "\u{1F512} STAFF", channels: [{ name: "staff-chat", type: "text" }, { name: "staff-voice", type: "voice" }] }
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Support Staff", color: "#00aa00", hoist: true },
      { name: "Member", color: "#0066ff" }
    ]
  },
  study: {
    name: "Study Server",
    description: "A study/learning server with resources, study groups, and academic discussion.",
    categories: [
      { name: "\u{1F4CB} INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }, { name: "resources", type: "text" }] },
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "introductions", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "\u{1F4DA} STUDY", channels: [{ name: "study-groups", type: "text" }, { name: "homework-help", type: "text" }, { name: "study-voice", type: "voice" }] }
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Tutor", color: "#ffaa00", hoist: true },
      { name: "Student", color: "#0066ff" }
    ]
  },
  creator: {
    name: "Creator Server",
    description: "A content creator server with showcases, feedback, and collaboration.",
    categories: [
      { name: "\u{1F4CB} INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }, { name: "socials", type: "text" }] },
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "introductions", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "\u{1F3A8} CREATIVE", channels: [{ name: "showcase", type: "text" }, { name: "feedback", type: "text" }, { name: "collab", type: "text" }] },
      { name: "\u{1F50A} VOICE", channels: [{ name: "General Voice", type: "voice" }, { name: "Stream Lounge", type: "voice" }] }
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Creator", color: "#aa00ff", hoist: true },
      { name: "Member", color: "#0066ff" }
    ]
  },
  clan: {
    name: "Clan Server",
    description: "A competitive gaming clan server with tryouts, scrims, and team coordination.",
    categories: [
      { name: "\u{1F4CB} INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }, { name: "roster", type: "text" }] },
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "\u{1F3AE} COMPETITIVE", channels: [{ name: "strategies", type: "text" }, { name: "scrims", type: "text" }, { name: "tryouts", type: "text" }] },
      { name: "\u{1F50A} VOICE", channels: [{ name: "Team Voice", type: "voice" }, { name: "Scrim Room", type: "voice" }] }
    ],
    roles: [
      { name: "Leader", color: "#ff0000", hoist: true },
      { name: "Officer", color: "#ffaa00", hoist: true },
      { name: "Member", color: "#0066ff" },
      { name: "Recruit", color: "#888888" }
    ]
  },
  social: {
    name: "Social Server",
    description: "A casual social server for hanging out, sharing, and chatting.",
    categories: [
      { name: "\u{1F4CB} INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "introductions", type: "text" }, { name: "memes", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "\u{1F50A} VOICE", channels: [{ name: "General Voice", type: "voice" }, { name: "Music", type: "voice" }, { name: "AFK", type: "voice" }] }
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Member", color: "#0066ff" }
    ]
  },
  friends: {
    name: "Friends Server",
    description: "A private server for friends with voice channels and casual chat.",
    categories: [
      { name: "\u{1F4AC} GENERAL", channels: [{ name: "general", type: "text" }, { name: "memes", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "\u{1F50A} VOICE", channels: [{ name: "Hangout", type: "voice" }, { name: "Gaming", type: "voice" }, { name: "AFK", type: "voice" }] }
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Friend", color: "#00ff00" }
    ]
  }
};
async function buildFromTemplate(guild, template, executorId) {
  const role = (0, import_permissions.resolveRole)({
    userId: executorId,
    guildOwnerId: guild.ownerId,
    adminIds: import_env.config.admin.discordIds
  });
  const perm = (0, import_permissions.hasPermission)(role, "admin");
  if (!perm.allowed) {
    return { success: false, message: `\u274C Permission denied: ${perm.reason}`, details: [] };
  }
  const details = [];
  try {
    for (const roleData of template.roles) {
      const role2 = await guild.roles.create({
        name: roleData.name,
        color: roleData.color,
        hoist: roleData.hoist || false,
        reason: `Server Builder: ${template.name}`
      });
      details.push(`Created role: ${role2.name}`);
    }
    for (const catData of template.categories) {
      const category = await guild.channels.create({
        name: catData.name,
        type: import_discord.ChannelType.GuildCategory
      });
      details.push(`Created category: ${category.name}`);
      for (const chData of catData.channels) {
        const channel = await guild.channels.create({
          name: chData.name,
          type: chData.type === "voice" ? import_discord.ChannelType.GuildVoice : import_discord.ChannelType.GuildText,
          parent: category.id,
          topic: chData.description,
          reason: `Server Builder: ${template.name}`
        });
        details.push(`Created ${chData.type}: #${channel.name}`);
      }
    }
    (0, import_audit.recordAudit)({
      who: executorId,
      what: `Built server from template: ${template.name}`,
      where: "discord",
      guildId: guild.id,
      result: "success",
      details: details.join("; ")
    });
    return { success: true, message: `\u2705 Server built from "${template.name}" template!`, details };
  } catch (error) {
    (0, import_audit.recordAudit)({
      who: executorId,
      what: `Failed to build server from template: ${template.name}`,
      where: "discord",
      guildId: guild.id,
      result: "failure",
      details: error instanceof Error ? error.message : String(error)
    });
    return {
      success: false,
      message: "\u274C Failed to build server.",
      details
    };
  }
}
function listTemplates() {
  return Object.entries(TEMPLATES).map(
    ([key, template]) => new import_discord.EmbedBuilder().setTitle(`\u{1F4E6} ${template.name}`).setDescription(template.description).addFields(
      { name: "Categories", value: String(template.categories.length), inline: true },
      { name: "Total Channels", value: String(template.categories.reduce((a, c) => a + c.channels.length, 0)), inline: true },
      { name: "Roles", value: String(template.roles.length), inline: true }
    ).setFooter({ text: `Template ID: ${key}` })
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TEMPLATES,
  buildFromTemplate,
  listTemplates
});
