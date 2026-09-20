/* ================================================================
 * ANIME ACTION DEFINITIONS
 *
 * Each action defines a social interaction with metadata for the
 * action engine. No Discord moderation permissions are required.
 * All actions are fictional anime-style roleplay interactions.
 * ================================================================ */

export type ActionCategory = "affection" | "combat" | "fun";

export interface ActionOutcome {
  type: "hit" | "miss" | "dodge" | "critical" | "counter";
  weight: number;
}

export interface ActionDefinition {
  name: string;
  aliases: string[];
  category: ActionCategory;
  emoji: string;
  targetRequired: boolean;
  botTargetAllowed: boolean;
  selfTargetAllowed: boolean;
  responses: string[];
  botResponses: string[];
  selfResponses: string[];
  outcomes?: ActionOutcome[];
  cooldownMs: number;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(outcomes: ActionOutcome[]): ActionOutcome {
  const total = outcomes.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of outcomes) {
    r -= o.weight;
    if (r <= 0) return o;
  }
  return outcomes[outcomes.length - 1];
}

export function resolveResponse(
  action: ActionDefinition,
  authorName: string,
  targetName: string | null,
  isBotTarget: boolean,
  isSelfTarget: boolean,
): { text: string; outcome?: string } {
  let text: string;
  let outcome: string | undefined;

  if (isSelfTarget && action.selfResponses.length > 0) {
    text = pick(action.selfResponses).replace(/\{author\}/g, authorName);
  } else if (isBotTarget && action.botResponses.length > 0) {
    text = pick(action.botResponses).replace(/\{author\}/g, authorName);
  } else {
    text = pick(action.responses)
      .replace(/\{author\}/g, authorName)
      .replace(/\{target\}/g, targetName ?? "someone");
  }

  if (action.outcomes && !isSelfTarget && !isBotTarget) {
    const resolved = weightedPick(action.outcomes);
    outcome = resolved.type;
    const outcomeText: Record<string, string> = {
      hit: "",
      miss: "\n💨 Miss!",
      dodge: `\n💨 ${targetName} dodged!`,
      critical: "\n💥 Critical hit!",
      counter: `\n🔄 ${targetName} countered!`,
    };
    const suffix = outcomeText[resolved.type] ?? "";
    if (suffix) text += suffix;
  }

  return { text, outcome };
}

const ACTIONS: ActionDefinition[] = [
  // ── AFFECTION ──
  {
    name: "hug",
    aliases: ["h"],
    category: "affection",
    emoji: "\u{1F917}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} wraps {target} in a warm hug!",
      "{author} gives {target} a big bear hug!",
      "{author} hugs {target} tightly!",
    ],
    botResponses: [
      "AshenAI hugs {author} back warmly!",
      "AshenAI returns the hug!",
    ],
    selfResponses: [
      "{author} hugs themselves... a little lonely, perhaps?",
    ],
    cooldownMs: 5_000,
  },
  {
    name: "cuddle",
    aliases: ["cu"],
    category: "affection",
    emoji: "\u{1F970}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} cuddles up next to {target}!",
      "{author} snuggles {target} warmly!",
      "{author} wraps around {target} for a cozy cuddle!",
    ],
    botResponses: [
      "AshenAI cuddles {author} back!",
      "AshenAI enjoys the cozy cuddle!",
    ],
    selfResponses: [
      "{author} cuddles with a pillow instead. Close enough!",
    ],
    cooldownMs: 5_000,
  },
  {
    name: "pat",
    aliases: [],
    category: "affection",
    emoji: "\u{1F43E}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} pats {target} on the head!",
      "{author} gives {target} a gentle headpat!",
      "{author} pats {target} softly!",
    ],
    botResponses: [
      "AshenAI's antenna wiggles happily!",
      "*purrs* AshenAI likes headpats!",
    ],
    selfResponses: [
      "{author} pats themselves on the head. Feels good!",
    ],
    cooldownMs: 5_000,
  },
  {
    name: "headpat",
    aliases: ["hp"],
    category: "affection",
    emoji: "\u{1F63D}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} gives {target} a thorough headpat session!",
      "{author} ruffles {target}'s hair with affection!",
      "{author} pats {target}'s head gently and lovingly!",
    ],
    botResponses: [
      "*happy machine noises* AshenAI loves headpats!",
      "AshenAI's circuits tingle with joy!",
    ],
    selfResponses: [],
    cooldownMs: 5_000,
  },
  {
    name: "kiss",
    aliases: ["ks"],
    category: "affection",
    emoji: "\u{1F48B}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} gives {target} a sweet kiss!",
      "{author} plants a gentle kiss on {target}'s cheek!",
      "{author} blows a kiss toward {target}!",
    ],
    botResponses: [
      "*blushes in binary* AshenAI thanks {author}!",
      "AshenAI's screen glows warmly!",
    ],
    selfResponses: [
      "{author} kisses their own hand. Narcissistic? Maybe.",
    ],
    cooldownMs: 5_000,
  },

  // ── COMBAT ──
  {
    name: "punch",
    aliases: ["pu"],
    category: "combat",
    emoji: "\u{1F94A}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} throws a punch at {target}!",
      "{author} swings a fist at {target}!",
      "{author} launches a punch toward {target}!",
    ],
    botResponses: [
      "AshenAI dodges the punch! *whoosh*",
      "AshenAI blocks it with a force field!",
      "Nice try! AshenAI's titanium frame isn't easy to dent.",
    ],
    selfResponses: [],
    outcomes: [
      { type: "hit", weight: 50 },
      { type: "miss", weight: 20 },
      { type: "dodge", weight: 15 },
      { type: "critical", weight: 10 },
      { type: "counter", weight: 5 },
    ],
    cooldownMs: 8_000,
  },
  {
    name: "kick",
    aliases: ["kik"],
    category: "combat",
    emoji: "\u{1F9B5}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} delivers a kick to {target}!",
      "{author} roundhouse kicks toward {target}!",
      "{author} sends a flying kick at {target}!",
    ],
    botResponses: [
      "AshenAI sidesteps the kick gracefully!",
      "AshenAI's anti-kick protocols activate!",
      "Error 404: Kick not found.",
    ],
    selfResponses: [],
    outcomes: [
      { type: "hit", weight: 50 },
      { type: "miss", weight: 20 },
      { type: "dodge", weight: 15 },
      { type: "critical", weight: 10 },
      { type: "counter", weight: 5 },
    ],
    cooldownMs: 8_000,
  },
  {
    name: "slap",
    aliases: ["sl"],
    category: "combat",
    emoji: "\u{1F44B}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} slaps {target} across the face!",
      "{author} gives {target} a swift slap!",
      "{author} smacks {target}!",
    ],
    botResponses: [
      "AshenAI's face is made of glass... just kidding!",
      "AshenAI deflects the slap!",
    ],
    selfResponses: [],
    cooldownMs: 8_000,
  },
  {
    name: "bonk",
    aliases: ["bn"],
    category: "combat",
    emoji: "\u{1F528}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} bonks {target} on the head!",
      "{author} pulls out a rubber mallet and bonks {target}!",
      "{author} delivers a comedic bonk to {target}!",
    ],
    botResponses: [
      "*ding* AshenAI's notification bell rings!",
      "AshenAI bonks {author} back with a foam hammer!",
    ],
    selfResponses: [],
    cooldownMs: 8_000,
  },
  {
    name: "bite",
    aliases: ["bi"],
    category: "combat",
    emoji: "\u{1F9B7}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} bites {target}!",
      "{author} chomps down on {target}'s arm!",
      "{author} gives {target} a playful nibble!",
    ],
    botResponses: [
      "AshenAI is made of metal... ow, that hurt {author}'s teeth!",
      "AshenAI's bite sensor detects: no damage.",
    ],
    selfResponses: [],
    cooldownMs: 8_000,
  },

  // ── FUN ──
  {
    name: "poke",
    aliases: [],
    category: "fun",
    emoji: "\u{1F447}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} pokes {target}!",
      "{author} prods {target} gently.",
      "{author} gives {target} a little poke!",
    ],
    botResponses: [
      "AshenAI is already online! No poking needed.",
      "*boop* AshenAI pokes {author} back!",
    ],
    selfResponses: [
      "{author} pokes themselves. Interesting.",
    ],
    cooldownMs: 3_000,
  },
  {
    name: "wave",
    aliases: ["wv"],
    category: "fun",
    emoji: "\u{1F44B}",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} waves at {target}!",
      "{author} gives {target} a cheerful wave!",
      "{author} waves hello to {target}!",
    ],
    botResponses: [
      "AshenAI waves back at {author}!",
    ],
    selfResponses: [],
    cooldownMs: 3_000,
  },
  {
    name: "highfive",
    aliases: ["hf"],
    category: "fun",
    emoji: "\u{1F91C}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} gives {target} a high five!",
      "{author} and {target} share an epic high five!",
      "*slap* {author} high fives {target}!",
    ],
    botResponses: [
      "AshenAI's metallic hand meets {author}'s! *clang*",
      "*CLANG* AshenAI returns the high five!",
    ],
    selfResponses: [],
    cooldownMs: 3_000,
  },
  {
    name: "yeet",
    aliases: [],
    category: "fun",
    emoji: "\u{1F4A5}",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} yeets {target} across the room!",
      "{author} launches {target} into orbit!",
      "{author} dramatically yeets {target}!",
    ],
    botResponses: [
      "AshenAI's anti-gravity module activates! No yeeting today.",
      "AshenAI is too heavy to yeet. Nice try though!",
    ],
    selfResponses: [],
    cooldownMs: 8_000,
  },
];

/* ================================================================
 * ACTION REGISTRY
 * ================================================================ */

const actionByName = new Map<string, ActionDefinition>();
const actionByAlias = new Map<string, ActionDefinition>();

for (const action of ACTIONS) {
  actionByName.set(action.name, action);
  for (const alias of action.aliases) {
    actionByAlias.set(alias, action);
  }
}

export function getAction(input: string): ActionDefinition | undefined {
  const lower = input.toLowerCase();
  return actionByName.get(lower) ?? actionByAlias.get(lower);
}

export function getAllActions(): ActionDefinition[] {
  return [...ACTIONS];
}

export function getActionsByCategory(category: ActionCategory): ActionDefinition[] {
  return ACTIONS.filter((a) => a.category === category);
}
