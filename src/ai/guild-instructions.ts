import { loadGuildConfig } from "../core/guild-config";

/**
 * Hard cap mirroring `/personality set`'s input limit (2000 chars) so a
 * stale or hand-edited row can never balloon the system prompt.
 */
const MAX_INSTRUCTION_CHARS = 2000;

/**
 * Server-administrator authored instructions (`/personality set`).
 *
 * These were persisted and displayed by `/settings` but never reached the
 * model, so admins' custom instructions were silently ignored. The block is
 * clearly delimited and only ever sourced from the guild's own config, which
 * requires ManageGuild (plus owner/admin) to write.
 *
 * Returns "" when no usable instructions exist.
 */
export function buildGuildInstructionBlock(
  guildId?: string | null,
): string {
  if (!guildId) return "";

  let raw: string | undefined;
  try {
    raw = loadGuildConfig(guildId).personality?.customInstructions;
  } catch {
    return "";
  }

  const text = (raw ?? "").trim().slice(0, MAX_INSTRUCTION_CHARS);
  if (!text) return "";

  // Neutralise any occurrence of the terminator inside admin-supplied text,
  // otherwise a rogue line could close the block early and shift the boundary.
  const safeText = text.replace(/END SERVER INSTRUCTIONS/g, "END\u00A0SERVER INSTRUCTIONS");

  return [
    "",
    "SERVER INSTRUCTIONS (configured by this server's administrators):",
    safeText,
    "END SERVER INSTRUCTIONS",
  ].join("\n");
}
