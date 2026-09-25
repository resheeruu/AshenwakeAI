/**
 * Default mention policy for every message this bot sends.
 *
 * Without a client-level `allowedMentions` policy, any model output or
 * user-influenced string that reaches Discord (e.g. `@everyone`, `@here`,
 * `<@&roleId>`) is delivered with the bot's full mention privileges.
 * A single prompt-injected reply could therefore mass-ping a whole server.
 *
 * `parse: ["users"]` keeps normal user mentions working (including reply
 * pings) while blocking `@everyone` / `@here` and role mentions. Per-call
 * options may still tighten this further — see the AFK/anime `safeReply`
 * helper, which uses `{ parse: [] }`.
 */
import type { ClientOptions } from "discord.js";

export type AllowedMentionsOption = NonNullable<
  ClientOptions["allowedMentions"]
>;

export const SAFE_ALLOWED_MENTIONS: AllowedMentionsOption = {
  parse: ["users"],
};
