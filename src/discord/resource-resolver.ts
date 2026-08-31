import type { Guild, GuildChannel, GuildMember, Role, ChannelType as DiscordChannelType } from "discord.js";
import { ChannelType } from "discord.js";

/* ================================================================
 * RESOURCE RESOLVER
 *
 * Reusable resolution layer for channels, roles, and members.
 * Replaces fragile regex matching in buildToolArgs with a proper
 * resolution strategy that handles IDs, exact names, normalized
 * names, mention syntax, and case-insensitive matching.
 *
 * Returns candidates on ambiguity so the agent can ask for
 * clarification instead of guessing wrong.
 * ================================================================ */

/* ================================================================
 * TYPES
 * ================================================================ */

export interface ResolveResult<T> {
  exact: T | null;
  candidates: T[];
  ambiguous: boolean;
}

export interface ResolvedChannel {
  id: string;
  name: string;
  type: DiscordChannelType;
  parentId: string | null;
}

export interface ResolvedRole {
  id: string;
  name: string;
  position: number;
}

export interface ResolvedMember {
  id: string;
  username: string;
  displayName: string;
  joinedAt: number | null;
}

/* ================================================================
 * CHANNEL RESOLUTION
 *
 * Matches by:
 *   1. Exact ID
 *   2. Mention syntax (<#id>)
 *   3. Exact name (case-insensitive)
 *   4. Normalized name (special chars stripped)
 *   5. Partial match
 *
 * Validates channel type when requestedType is provided.
 * ================================================================ */

export function resolveChannel(
  guild: Guild,
  input: string,
  requestedType?: "text" | "voice" | "category" | "announcement" | "forum",
): ResolveResult<ResolvedChannel> {
  const normalized = input.trim().toLowerCase();
  const stripped = normalizeName(normalized);

  // Extract ID from mention syntax <#123456>
  const mentionMatch = normalized.match(/^<#(\d+)>$/);
  const rawId = mentionMatch?.[1] || (/^\d{17,20}$/.test(normalized) ? normalized : null);

  const allChannels = [...guild.channels.cache.values()];

  // Filter by requested type if provided
  const typeFilter = requestedType ? getTypeFilter(requestedType) : null;
  const candidates = typeFilter ? allChannels.filter(ch => typeFilter.includes(ch.type)) : allChannels;

  // 1. Exact ID match
  if (rawId) {
    const byId = guild.channels.cache.get(rawId);
    if (byId) {
      const resolved = channelToResolved(byId);
      if (resolved && (!typeFilter || typeFilter.includes(byId.type))) {
        return { exact: resolved, candidates: [resolved], ambiguous: false };
      }
    }
  }

  // 2. Exact name match (case-insensitive)
  const exactNameMatches = candidates.filter(
    ch => ch.name.toLowerCase() === normalized,
  );

  if (exactNameMatches.length === 1) {
    const resolved = channelToResolved(exactNameMatches[0])!;
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  // 3. Normalized name match (strip special chars)
  const normalizedMatches = candidates.filter(
    ch => normalizeName(ch.name.toLowerCase()) === stripped,
  );

  if (normalizedMatches.length === 1) {
    const resolved = channelToResolved(normalizedMatches[0])!;
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  // 4. Partial match
  const partialMatches = candidates.filter(
    ch =>
      ch.name.toLowerCase().includes(normalized) ||
      normalized.includes(ch.name.toLowerCase()),
  );

  const allMatches = [...new Set([...exactNameMatches, ...normalizedMatches, ...partialMatches])];

  if (allMatches.length === 0) {
    return { exact: null, candidates: [], ambiguous: false };
  }

  if (allMatches.length === 1) {
    const resolved = channelToResolved(allMatches[0])!;
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  // Multiple matches — ambiguous
  const resolvedCandidates = allMatches
    .map(ch => channelToResolved(ch))
    .filter(Boolean) as ResolvedChannel[];

  return { exact: null, candidates: resolvedCandidates, ambiguous: true };
}

/* ================================================================
 * ROLE RESOLUTION
 *
 * Matches by:
 *   1. Exact ID
 *   2. Exact name (case-insensitive)
 *   3. Normalized name
 *   4. Partial match
 * ================================================================ */

export function resolveRoleByName(
  guild: Guild,
  input: string,
): ResolveResult<ResolvedRole> {
  const normalized = input.trim().toLowerCase();
  const stripped = normalizeName(normalized);

  const allRoles = [...guild.roles.cache.values()]
    .filter(r => r.name !== "@everyone");

  // 1. Exact ID match
  if (/^\d{17,20}$/.test(normalized)) {
    const byId = guild.roles.cache.get(normalized);
    if (byId && byId.name !== "@everyone") {
      const resolved = roleToResolved(byId);
      return { exact: resolved, candidates: [resolved], ambiguous: false };
    }
  }

  // 2. Exact name match
  const exactMatches = allRoles.filter(
    r => r.name.toLowerCase() === normalized,
  );

  if (exactMatches.length === 1) {
    const resolved = roleToResolved(exactMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  // 3. Normalized name match
  const normalizedMatches = allRoles.filter(
    r => normalizeName(r.name.toLowerCase()) === stripped,
  );

  if (normalizedMatches.length === 1) {
    const resolved = roleToResolved(normalizedMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  // 4. Partial match
  const partialMatches = allRoles.filter(
    r =>
      r.name.toLowerCase().includes(normalized) ||
      normalized.includes(r.name.toLowerCase()),
  );

  const allMatches = [...new Set([...exactMatches, ...normalizedMatches, ...partialMatches])];

  if (allMatches.length === 0) {
    return { exact: null, candidates: [], ambiguous: false };
  }

  if (allMatches.length === 1) {
    const resolved = roleToResolved(allMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  const resolvedCandidates = allMatches
    .map(r => roleToResolved(r))
    .filter(Boolean) as ResolvedRole[];

  return { exact: null, candidates: resolvedCandidates, ambiguous: true };
}

/* ================================================================
 * MEMBER RESOLUTION
 *
 * Matches by:
 *   1. Mention syntax (<@id> or <@!id>)
 *   2. Exact ID
 *   3. Username (case-insensitive)
 *   4. Display name (case-insensitive)
 *   5. Partial match
 * ================================================================ */

export function resolveMember(
  guild: Guild,
  input: string,
): ResolveResult<ResolvedMember> {
  const normalized = input.trim().toLowerCase();

  // Extract ID from mention syntax
  const mentionMatch = normalized.match(/^<@!?(\d+)>$/);
  const rawId = mentionMatch?.[1] || (/^\d{17,20}$/.test(normalized) ? normalized : null);

  const allMembers = [...guild.members.cache.values()];

  // 1. Exact ID match
  if (rawId) {
    const byId = guild.members.cache.get(rawId);
    if (byId) {
      const resolved = memberToResolved(byId);
      return { exact: resolved, candidates: [resolved], ambiguous: false };
    }
  }

  // 2. Exact username match
  const exactUsername = allMembers.filter(
    m => m.user.username.toLowerCase() === normalized,
  );

  if (exactUsername.length === 1) {
    const resolved = memberToResolved(exactUsername[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  // 3. Exact display name match
  const exactDisplay = allMembers.filter(
    m => m.displayName.toLowerCase() === normalized,
  );

  if (exactDisplay.length === 1) {
    const resolved = memberToResolved(exactDisplay[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  // 4. Partial match on username or display name
  const partialMatches = allMembers.filter(
    m =>
      m.user.username.toLowerCase().includes(normalized) ||
      m.displayName.toLowerCase().includes(normalized) ||
      normalized.includes(m.user.username.toLowerCase()) ||
      normalized.includes(m.displayName.toLowerCase()),
  );

  const allMatches = [...new Set([...exactUsername, ...exactDisplay, ...partialMatches])];

  if (allMatches.length === 0) {
    return { exact: null, candidates: [], ambiguous: false };
  }

  if (allMatches.length === 1) {
    const resolved = memberToResolved(allMatches[0]);
    return { exact: resolved, candidates: [resolved], ambiguous: false };
  }

  const resolvedCandidates = allMatches
    .map(m => memberToResolved(m))
    .filter(Boolean) as ResolvedMember[];

  return { exact: null, candidates: resolvedCandidates, ambiguous: true };
}

/* ================================================================
 * CATEGORY RESOLUTION (delegates to channel resolution with type)
 * ================================================================ */

export function resolveCategory(
  guild: Guild,
  input: string,
): ResolveResult<ResolvedChannel> {
  return resolveChannel(guild, input, "category");
}

/* ================================================================
 * HELPERS
 * ================================================================ */

function normalizeName(name: string): string {
  return name.replace(/[^a-z0-9]/g, "");
}

function channelToResolved(channel: { id: string; name: string; type: number; parentId: string | null }): ResolvedChannel | null {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type as DiscordChannelType,
    parentId: channel.parentId,
  };
}

function roleToResolved(role: { id: string; name: string; position: number }): ResolvedRole {
  return {
    id: role.id,
    name: role.name,
    position: role.position,
  };
}

function memberToResolved(member: { id: string; user: { username: string }; displayName: string; joinedTimestamp: number | null }): ResolvedMember {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    joinedAt: member.joinedTimestamp,
  };
}

function getTypeFilter(type: string): number[] | null {
  const map: Record<string, number[]> = {
    text: [ChannelType.GuildText],
    voice: [ChannelType.GuildVoice],
    category: [ChannelType.GuildCategory],
    announcement: [ChannelType.GuildAnnouncement],
    forum: [ChannelType.GuildForum],
  };
  return map[type] || null;
}

/* ================================================================
 * AMBIGUITY FORMATTING
 * ================================================================ */

export function formatAmbiguity(
  resourceType: "channel" | "role" | "member",
  candidates: Array<{ id: string; name: string }>,
): string {
  const list = candidates
    .slice(0, 5)
    .map(c => `• **${c.name}** (\`${c.id}\`)`)
    .join("\n");

  const more = candidates.length > 5 ? `\n• ...and ${candidates.length - 5} more` : "";

  return `Multiple ${resourceType}s found. Please be more specific:\n${list}${more}`;
}
