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
var resource_resolver_exports = {};
__export(resource_resolver_exports, {
  formatAmbiguity: () => formatAmbiguity,
  resolveCategory: () => resolveCategory,
  resolveChannel: () => resolveChannel,
  resolveMember: () => resolveMember,
  resolveRoleByName: () => resolveRoleByName
});
module.exports = __toCommonJS(resource_resolver_exports);
var import_discord = require("discord.js");
function resolveChannel(guild, input, requestedType) {
  const normalized = input.trim().toLowerCase();
  const stripped = normalizeName(normalized);
  const mentionMatch = normalized.match(/^<#(\d+)>$/);
  const rawId = mentionMatch?.[1] || (/^\d{17,20}$/.test(normalized) ? normalized : null);
  const allChannels = [...guild.channels.cache.values()];
  const typeFilter = requestedType ? getTypeFilter(requestedType) : null;
  const candidates = typeFilter ? allChannels.filter((ch) => typeFilter.includes(ch.type)) : allChannels;
  if (rawId) {
    const byId = guild.channels.cache.get(rawId);
    if (byId) {
      const resolved = channelToResolved(byId);
      if (resolved && (!typeFilter || typeFilter.includes(byId.type))) {
        return { exact: resolved, candidates: [resolved], ambiguous: false };
      }
    }
  }
  const exactNameMatches = candidates.filter(
    (ch) => ch.name.toLowerCase() === normalized
  );
  if (exactNameMatches.length === 1) {
    const resolved = channelToResolved(exactNameMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const normalizedMatches = candidates.filter(
    (ch) => normalizeName(ch.name.toLowerCase()) === stripped
  );
  if (normalizedMatches.length === 1) {
    const resolved = channelToResolved(normalizedMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const partialMatches = candidates.filter(
    (ch) => ch.name.toLowerCase().includes(normalized) || normalized.includes(ch.name.toLowerCase())
  );
  const allMatches = [.../* @__PURE__ */ new Set([...exactNameMatches, ...normalizedMatches, ...partialMatches])];
  if (allMatches.length === 0) {
    return { exact: null, candidates: [], ambiguous: false };
  }
  if (allMatches.length === 1) {
    const resolved = channelToResolved(allMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const resolvedCandidates = allMatches.map((ch) => channelToResolved(ch)).filter(Boolean);
  return { exact: null, candidates: resolvedCandidates, ambiguous: true };
}
function resolveRoleByName(guild, input) {
  const normalized = input.trim().toLowerCase();
  const stripped = normalizeName(normalized);
  const allRoles = [...guild.roles.cache.values()].filter((r) => r.name !== "@everyone");
  if (/^\d{17,20}$/.test(normalized)) {
    const byId = guild.roles.cache.get(normalized);
    if (byId && byId.name !== "@everyone") {
      const resolved = roleToResolved(byId);
      return { exact: resolved, candidates: [resolved], ambiguous: false };
    }
  }
  const exactMatches = allRoles.filter(
    (r) => r.name.toLowerCase() === normalized
  );
  if (exactMatches.length === 1) {
    const resolved = roleToResolved(exactMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const normalizedMatches = allRoles.filter(
    (r) => normalizeName(r.name.toLowerCase()) === stripped
  );
  if (normalizedMatches.length === 1) {
    const resolved = roleToResolved(normalizedMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const partialMatches = allRoles.filter(
    (r) => r.name.toLowerCase().includes(normalized) || normalized.includes(r.name.toLowerCase())
  );
  const allMatches = [.../* @__PURE__ */ new Set([...exactMatches, ...normalizedMatches, ...partialMatches])];
  if (allMatches.length === 0) {
    return { exact: null, candidates: [], ambiguous: false };
  }
  if (allMatches.length === 1) {
    const resolved = roleToResolved(allMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const resolvedCandidates = allMatches.map((r) => roleToResolved(r)).filter(Boolean);
  return { exact: null, candidates: resolvedCandidates, ambiguous: true };
}
function resolveMember(guild, input) {
  const normalized = input.trim().toLowerCase();
  const mentionMatch = normalized.match(/^<@!?(\d+)>$/);
  const rawId = mentionMatch?.[1] || (/^\d{17,20}$/.test(normalized) ? normalized : null);
  const allMembers = [...guild.members.cache.values()];
  if (rawId) {
    const byId = guild.members.cache.get(rawId);
    if (byId) {
      const resolved = memberToResolved(byId);
      return { exact: resolved, candidates: [resolved], ambiguous: false };
    }
  }
  const exactUsername = allMembers.filter(
    (m) => m.user.username.toLowerCase() === normalized
  );
  if (exactUsername.length === 1) {
    const resolved = memberToResolved(exactUsername[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const exactDisplay = allMembers.filter(
    (m) => m.displayName.toLowerCase() === normalized
  );
  if (exactDisplay.length === 1) {
    const resolved = memberToResolved(exactDisplay[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const partialMatches = allMembers.filter(
    (m) => m.user.username.toLowerCase().includes(normalized) || m.displayName.toLowerCase().includes(normalized) || normalized.includes(m.user.username.toLowerCase()) || normalized.includes(m.displayName.toLowerCase())
  );
  const allMatches = [.../* @__PURE__ */ new Set([...exactUsername, ...exactDisplay, ...partialMatches])];
  if (allMatches.length === 0) {
    return { exact: null, candidates: [], ambiguous: false };
  }
  if (allMatches.length === 1) {
    const resolved = memberToResolved(allMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }
  const resolvedCandidates = allMatches.map((m) => memberToResolved(m)).filter(Boolean);
  return { exact: null, candidates: resolvedCandidates, ambiguous: true };
}
function resolveCategory(guild, input) {
  return resolveChannel(guild, input, "category");
}
function normalizeName(name) {
  return name.replace(/[^a-z0-9]/g, "");
}
function channelToResolved(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId
  };
}
function roleToResolved(role) {
  return {
    id: role.id,
    name: role.name,
    position: role.position
  };
}
function memberToResolved(member) {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    joinedAt: member.joinedTimestamp
  };
}
function getTypeFilter(type) {
  const map = {
    text: [import_discord.ChannelType.GuildText],
    voice: [import_discord.ChannelType.GuildVoice],
    category: [import_discord.ChannelType.GuildCategory],
    announcement: [import_discord.ChannelType.GuildAnnouncement],
    forum: [import_discord.ChannelType.GuildForum]
  };
  return map[type] || null;
}
function formatAmbiguity(resourceType, candidates) {
  const list = candidates.slice(0, 5).map((c) => `\u2022 **${c.name}** (\`${c.id}\`)`).join("\n");
  const more = candidates.length > 5 ? `
\u2022 ...and ${candidates.length - 5} more` : "";
  return `Multiple ${resourceType}s found. Please be more specific:
${list}${more}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  formatAmbiguity,
  resolveCategory,
  resolveChannel,
  resolveMember,
  resolveRoleByName
});
