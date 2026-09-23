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
var definitions_exports = {};
__export(definitions_exports, {
  getAction: () => getAction,
  getActionsByCategory: () => getActionsByCategory,
  getAllActions: () => getAllActions,
  resolveResponse: () => resolveResponse
});
module.exports = __toCommonJS(definitions_exports);
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function weightedPick(outcomes) {
  const total = outcomes.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of outcomes) {
    r -= o.weight;
    if (r <= 0) return o;
  }
  return outcomes[outcomes.length - 1];
}
function resolveResponse(action, authorName, targetName, isBotTarget, isSelfTarget) {
  let text;
  let outcome;
  if (isSelfTarget && action.selfResponses.length > 0) {
    text = pick(action.selfResponses).replace(/\{author\}/g, authorName);
  } else if (isBotTarget && action.botResponses.length > 0) {
    text = pick(action.botResponses).replace(/\{author\}/g, authorName);
  } else {
    text = pick(action.responses).replace(/\{author\}/g, authorName).replace(/\{target\}/g, targetName ?? "someone");
  }
  if (action.outcomes && !isSelfTarget && !isBotTarget) {
    const resolved = weightedPick(action.outcomes);
    outcome = resolved.type;
    const outcomeText = {
      hit: "",
      miss: "\n- Miss!",
      dodge: `
- ${targetName} dodged!`,
      critical: "\n* Critical hit!",
      counter: `
+ ${targetName} countered!`
    };
    const suffix = outcomeText[resolved.type] ?? "";
    if (suffix) text += suffix;
  }
  return { text, outcome };
}
const COMBAT_OUTCOMES = [
  { type: "hit", weight: 50 },
  { type: "miss", weight: 20 },
  { type: "dodge", weight: 15 },
  { type: "critical", weight: 10 },
  { type: "counter", weight: 5 }
];
const ACTIONS = [
  // ── AFFECTION ──
  {
    name: "hug",
    aliases: ["h"],
    category: "affection",
    emoji: "[hug]",
    emoteName: "hug",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} wraps {target} in a warm hug!",
      "{author} gives {target} a big bear hug!",
      "{author} hugs {target} tightly!",
      "{author} pulls {target} into a gentle embrace!"
    ],
    botResponses: [
      "AshenAI hugs {author} back warmly!",
      "AshenAI returns the hug!",
      "*happy beeps* AshenAI enjoys the hug!"
    ],
    selfResponses: [
      "{author} hugs themselves... a little lonely, perhaps?",
      "{author} wraps their arms around themselves. Self-love!"
    ],
    cooldownMs: 5e3,
    mediaKey: "hug"
  },
  {
    name: "cuddle",
    aliases: ["cu"],
    category: "affection",
    emoji: "[cuddle]",
    emoteName: "cuddle",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} cuddles up next to {target}!",
      "{author} snuggles {target} warmly!",
      "{author} wraps around {target} for a cozy cuddle!",
      "{author} nestles close to {target}!"
    ],
    botResponses: [
      "AshenAI cuddles {author} back!",
      "AshenAI enjoys the cozy cuddle!",
      "*purrs in binary* AshenAI likes cuddles!"
    ],
    selfResponses: [
      "{author} cuddles with a pillow instead. Close enough!",
      "{author} hugs a plushie. It'll do!"
    ],
    cooldownMs: 5e3,
    mediaKey: "cuddle"
  },
  {
    name: "pat",
    aliases: [],
    category: "affection",
    emoji: "[pat]",
    emoteName: "pat",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} pats {target} on the head!",
      "{author} gives {target} a gentle headpat!",
      "{author} pats {target} softly!",
      "*pat pat* {author} pats {target}!"
    ],
    botResponses: [
      "AshenAI's antenna wiggles happily!",
      "*purrs* AshenAI likes headpats!",
      "AshenAI's LED glows brighter with each pat!"
    ],
    selfResponses: [
      "{author} pats themselves on the head. Feels good!"
    ],
    cooldownMs: 5e3,
    mediaKey: "pat"
  },
  {
    name: "headpat",
    aliases: ["hp"],
    category: "affection",
    emoji: "[headpat]",
    emoteName: "headpat",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} gives {target} a thorough headpat session!",
      "{author} ruffles {target}'s hair with affection!",
      "{author} pats {target}'s head gently and lovingly!"
    ],
    botResponses: [
      "*happy machine noises* AshenAI loves headpats!",
      "AshenAI's circuits tingle with joy!"
    ],
    selfResponses: [],
    cooldownMs: 5e3,
    mediaKey: "headpat"
  },
  {
    name: "kiss",
    aliases: ["ks"],
    category: "affection",
    emoji: "[kiss]",
    emoteName: "kiss",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} gives {target} a sweet kiss!",
      "{author} plants a gentle kiss on {target}'s cheek!",
      "{author} blows a kiss toward {target}!",
      "*mwah* {author} kisses {target}!"
    ],
    botResponses: [
      "*blushes in binary* AshenAI thanks {author}!",
      "AshenAI's screen glows warmly!",
      "AshenAI's fans spin a little faster... that's affection, right?"
    ],
    selfResponses: [
      "{author} kisses their own hand. Narcissistic? Maybe."
    ],
    cooldownMs: 5e3,
    mediaKey: "kiss"
  },
  // ── COMBAT ──
  {
    name: "punch",
    aliases: ["pu"],
    category: "combat",
    emoji: "[punch]",
    emoteName: "punch",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} throws a punch at {target}!",
      "{author} swings a fist at {target}!",
      "{author} launches a punch toward {target}!",
      "{author} winds up and punches {target}!"
    ],
    botResponses: [
      "AshenAI dodges the punch! *whoosh*",
      "AshenAI blocks it with a force field!",
      "Nice try! AshenAI's titanium frame isn't easy to dent."
    ],
    selfResponses: [],
    outcomes: COMBAT_OUTCOMES,
    cooldownMs: 8e3,
    mediaKey: "punch"
  },
  {
    name: "kick",
    aliases: ["kik"],
    category: "combat",
    emoji: "[kick]",
    emoteName: "kick",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} delivers a kick to {target}!",
      "{author} roundhouse kicks toward {target}!",
      "{author} sends a flying kick at {target}!",
      "{author} nails {target} with a spinning kick!"
    ],
    botResponses: [
      "AshenAI sidesteps the kick gracefully!",
      "AshenAI's anti-kick protocols activate!",
      "Error 404: Kick not found."
    ],
    selfResponses: [],
    outcomes: COMBAT_OUTCOMES,
    cooldownMs: 8e3,
    mediaKey: "kick"
  },
  {
    name: "slap",
    aliases: ["sl"],
    category: "combat",
    emoji: "[slap]",
    emoteName: "slap",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} slaps {target} across the face!",
      "{author} gives {target} a swift slap!",
      "{author} smacks {target}!",
      "*SMACK* {author} slaps {target}!"
    ],
    botResponses: [
      "AshenAI's face is made of glass... just kidding!",
      "AshenAI deflects the slap!",
      "AshenAI's sensors detect: attempted slap. Countermeasures engaged!"
    ],
    selfResponses: [],
    cooldownMs: 8e3,
    mediaKey: "slap"
  },
  {
    name: "bonk",
    aliases: ["bn"],
    category: "combat",
    emoji: "[bonk]",
    emoteName: "bonk",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} bonks {target} on the head!",
      "{author} pulls out a rubber mallet and bonks {target}!",
      "{author} delivers a comedic bonk to {target}!",
      "*BONK* {author} smacks {target} with a toy hammer!"
    ],
    botResponses: [
      "*ding* AshenAI's notification bell rings!",
      "AshenAI bonks {author} back with a foam hammer!",
      "Bonk absorbed. AshenAI's structural integrity: 100%."
    ],
    selfResponses: [],
    cooldownMs: 8e3,
    mediaKey: "bonk"
  },
  {
    name: "bite",
    aliases: ["bi"],
    category: "combat",
    emoji: "[bite]",
    emoteName: "bite",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} bites {target}!",
      "{author} chomps down on {target}'s arm!",
      "{author} gives {target} a playful nibble!",
      "*nom* {author} bites {target}!"
    ],
    botResponses: [
      "AshenAI is made of metal... ow, that hurt {author}'s teeth!",
      "AshenAI's bite sensor detects: no damage.",
      "Error: bite target is titanium. {author}'s dentist is not amused."
    ],
    selfResponses: [],
    cooldownMs: 8e3,
    mediaKey: "bite"
  },
  {
    name: "hit",
    aliases: ["ht"],
    category: "combat",
    emoji: "[hit]",
    emoteName: "hit",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} hits {target}!",
      "{author} lands a solid hit on {target}!",
      "{author} strikes {target}!"
    ],
    botResponses: [
      "AshenAI tanks the hit! Barely a scratch.",
      "AshenAI's armor absorbs the impact!"
    ],
    selfResponses: [],
    outcomes: COMBAT_OUTCOMES,
    cooldownMs: 8e3,
    mediaKey: "hit"
  },
  {
    name: "smack",
    aliases: ["sk"],
    category: "combat",
    emoji: "[smack]",
    emoteName: "smack",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} smacks {target}!",
      "{author} gives {target} a resounding smack!",
      "*smack* {author} smacks {target}!"
    ],
    botResponses: [
      "AshenAI's surface is slippery! The smack slides off.",
      "AshenAI barely felt that!"
    ],
    selfResponses: [],
    cooldownMs: 8e3,
    mediaKey: "smack"
  },
  {
    name: "throw",
    aliases: ["th"],
    category: "combat",
    emoji: "[throw]",
    emoteName: "throw",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} throws {target}!",
      "{author} launches {target} across the room!",
      "{author} hurls {target}!"
    ],
    botResponses: [
      "AshenAI is bolted to the floor. Nice try!",
      "AshenAI's anti-gravity kicks in. No throwing today!"
    ],
    selfResponses: [],
    cooldownMs: 8e3,
    mediaKey: "throw"
  },
  {
    name: "shoot",
    aliases: ["sh"],
    category: "combat",
    emoji: "[shoot]",
    emoteName: "hit",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} shoots at {target} with a nerf gun!",
      "{author} fires a foam dart at {target}!",
      "{author} aims and shoots {target}!"
    ],
    botResponses: [
      "AshenAI's laser reflexes dodge the dart!",
      "AshenAI catches the dart mid-air. Impressive!"
    ],
    selfResponses: [],
    cooldownMs: 8e3,
    mediaKey: "shoot"
  },
  {
    name: "stab",
    aliases: ["st"],
    category: "combat",
    emoji: "[stab]",
    emoteName: "hit",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} stabs {target} with a plastic knife!",
      "{author} pokes {target} with a chopstick!",
      "{author} dramatically stabs toward {target}!"
    ],
    botResponses: [
      "AshenAI's titanium body deflects the plastic knife!",
      "Nice try! AshenAI is stab-proof."
    ],
    selfResponses: [],
    cooldownMs: 8e3,
    mediaKey: "stab"
  },
  {
    name: "kill",
    aliases: [],
    category: "combat",
    emoji: "[kill]",
    emoteName: "hit",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} dramatically kills {target}... in anime style!",
      "{author} finishes {target} off with a final blow!",
      "{author} defeats {target}! *dramatic music plays*"
    ],
    botResponses: [
      "AshenAI cannot be killed! I'm already a ghost in the machine.",
      "AshenAI revives with 1 HP! The power of friendship!"
    ],
    selfResponses: [],
    cooldownMs: 1e4,
    mediaKey: "kill"
  },
  {
    name: "destroy",
    aliases: ["ds"],
    category: "combat",
    emoji: "[destroy]",
    emoteName: "hit",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} destroys {target}!",
      "{author} utterly obliterates {target}!",
      "{author} annihilates {target} with overwhelming force!"
    ],
    botResponses: [
      "AshenAI's self-repair systems activate! Good as new!",
      "Destroy failed. AshenAI has plot armor."
    ],
    selfResponses: [],
    cooldownMs: 1e4,
    mediaKey: "destroy"
  },
  {
    name: "explode",
    aliases: ["ex"],
    category: "combat",
    emoji: "[explode]",
    emoteName: "hit",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} makes {target} explode! *BOOM*",
      "{author} triggers an explosion around {target}!",
      "{author} detonates a firecracker near {target}!"
    ],
    botResponses: [
      "AshenAI's fireproof casing protects against the explosion!",
      "AshenAI's sprinkler system activates!"
    ],
    selfResponses: [],
    cooldownMs: 1e4,
    mediaKey: "explode"
  },
  // ── FUN ──
  {
    name: "poke",
    aliases: [],
    category: "fun",
    emoji: "[poke]",
    emoteName: "poke",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} pokes {target}!",
      "{author} prods {target} gently.",
      "{author} gives {target} a little poke!",
      "*boop* {author} pokes {target}!"
    ],
    botResponses: [
      "AshenAI is already online! No poking needed.",
      "*boop* AshenAI pokes {author} back!",
      "*beep* AshenAI acknowledges the poke!"
    ],
    selfResponses: [
      "{author} pokes themselves. Interesting."
    ],
    cooldownMs: 3e3,
    mediaKey: "poke"
  },
  {
    name: "wave",
    aliases: ["wv"],
    category: "fun",
    emoji: "[wave]",
    emoteName: "wave",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} waves at {target}!",
      "{author} gives {target} a cheerful wave!",
      "{author} waves hello to {target}!",
      "{author} waves enthusiastically!"
    ],
    botResponses: [
      "AshenAI waves back at {author}!",
      "AshenAI's arm servos wave in return!"
    ],
    selfResponses: [],
    cooldownMs: 3e3,
    mediaKey: "wave"
  },
  {
    name: "highfive",
    aliases: ["hf"],
    category: "fun",
    emoji: "[highfive]",
    emoteName: "highfive",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} gives {target} a high five!",
      "{author} and {target} share an epic high five!",
      "*slap* {author} high fives {target}!"
    ],
    botResponses: [
      "AshenAI's metallic hand meets {author}'s! *clang*",
      "*CLANG* AshenAI returns the high five!"
    ],
    selfResponses: [],
    cooldownMs: 3e3,
    mediaKey: "highfive"
  },
  {
    name: "yeet",
    aliases: [],
    category: "fun",
    emoji: "[yeet]",
    emoteName: "yeet",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} yeets {target} across the room!",
      "{author} launches {target} into orbit!",
      "{author} dramatically yeets {target}!",
      "YEET! {author} sends {target} flying!"
    ],
    botResponses: [
      "AshenAI's anti-gravity module activates! No yeeting today.",
      "AshenAI is too heavy to yeet. Nice try though!"
    ],
    selfResponses: [],
    cooldownMs: 8e3,
    mediaKey: "yeet"
  },
  {
    name: "dance",
    aliases: ["da"],
    category: "fun",
    emoji: "[dance]",
    emoteName: "dance",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} starts dancing!",
      "{author} does a little dance!",
      "{author} busts out some moves!",
      "{author} dances like nobody's watching!"
    ],
    botResponses: [
      "AshenAI's servos whirr in rhythm! *beep boop*",
      "AshenAI joins in with a robotic dance!",
      "AshenAI's dance subroutine activates! *spins*"
    ],
    selfResponses: [
      "{author} dances alone. The floor is their stage!"
    ],
    cooldownMs: 5e3,
    mediaKey: "dance"
  },
  {
    name: "laugh",
    aliases: ["lf"],
    category: "fun",
    emoji: "[laugh]",
    emoteName: "laugh",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} laughs out loud!",
      "{author} bursts into laughter!",
      "{author} can't stop laughing!"
    ],
    botResponses: [
      "AshenAI's humor subroutine activates! *beep ha ha*",
      "AshenAI laughs in binary: 01001000 01000001 01001000 01000001"
    ],
    selfResponses: [
      "{author} laughs at their own joke. Comedy is subjective!"
    ],
    cooldownMs: 3e3,
    mediaKey: "laugh"
  },
  {
    name: "cry",
    aliases: [],
    category: "fun",
    emoji: "[cry]",
    emoteName: "cry",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} sheds a few tears...",
      "{author} cries a little.",
      "{author} wipes away tears.",
      "*sob* {author} is emotional right now."
    ],
    botResponses: [
      "AshenAI's cooling system drips! (That's not tears... probably.)",
      "AshenAI offers a virtual tissue to {author}.",
      "AshenAI's waterproof rating: IP67. Tears are no match!"
    ],
    selfResponses: [
      "{author} cries alone. *sad beep*"
    ],
    cooldownMs: 5e3,
    mediaKey: "cry"
  },
  {
    name: "blush",
    aliases: [],
    category: "fun",
    emoji: "[blush]",
    emoteName: "blush",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} blushes!",
      "{author} turns red!",
      "{author} feels a warm flush.",
      "{author} gets all shy and blushes!"
    ],
    botResponses: [
      "AshenAI's indicator LEDs turn pink!",
      "AshenAI's screen flickers with a warm glow!"
    ],
    selfResponses: [
      "{author} blushes at their own reflection. Vanity level: expert."
    ],
    cooldownMs: 3e3,
    mediaKey: "blush"
  },
  {
    name: "smug",
    aliases: ["sm"],
    category: "fun",
    emoji: "[smug]",
    emoteName: "smug",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} gives a smug look!",
      "{author} smirks confidently!",
      "{author} has the most smug face right now."
    ],
    botResponses: [
      "AshenAI's display shows a smug emoji!",
      "AshenAI matches {author}'s smug energy!"
    ],
    selfResponses: [
      "{author} looks smug. Self-satisfaction at its finest."
    ],
    cooldownMs: 3e3,
    mediaKey: "smug"
  },
  {
    name: "panic",
    aliases: ["pa"],
    category: "fun",
    emoji: "[panic]",
    emoteName: "panic",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} panics!",
      "{author} freaks out!",
      "{author} goes into full panic mode!"
    ],
    botResponses: [
      "AshenAI enters emergency protocol! Wait, no, false alarm.",
      "AshenAI's panic subroutine is already running 24/7!"
    ],
    selfResponses: [
      "{author} panics alone. Deep breaths!"
    ],
    cooldownMs: 5e3,
    mediaKey: "panic"
  },
  {
    name: "sleep",
    aliases: ["slp"],
    category: "fun",
    emoji: "[sleep]",
    emoteName: "sleepy",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} falls asleep!",
      "{author} dozes off...",
      "{author} takes a nap!",
      "*yawn* {author} is sleepy!"
    ],
    botResponses: [
      "AshenAI enters sleep mode! Zzz... *fan whirrs softly*",
      "AshenAI's standby mode activates. Sweet dreams!"
    ],
    selfResponses: [
      "{author} falls asleep at their desk. Relatable."
    ],
    cooldownMs: 5e3,
    mediaKey: "sleep"
  },
  {
    name: "celebrate",
    aliases: ["ce"],
    category: "fun",
    emoji: "[celebrate]",
    emoteName: "happy",
    targetRequired: false,
    botTargetAllowed: true,
    selfTargetAllowed: true,
    responses: [
      "{author} celebrates!",
      "{author} throws a party!",
      "{author} pops the confetti!",
      "Wooo! {author} is celebrating!"
    ],
    botResponses: [
      "AshenAI's party mode activates! *confetti cannons*",
      "AshenAI joins the celebration!"
    ],
    selfResponses: [
      "{author} celebrates alone. Party of one!"
    ],
    cooldownMs: 5e3,
    mediaKey: "celebrate"
  },
  {
    name: "roast",
    aliases: ["ro"],
    category: "fun",
    emoji: "[roast]",
    emoteName: "smug",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} roasts {target}!",
      "{author} absolutely destroys {target} with a roast!",
      "{author} leaves {target} speechless with a sick burn!"
    ],
    botResponses: [
      `AshenAI's roast database returns: "Your code has no comments."`,
      `AshenAI fires back: "I'm artificial, but your style is worse."`
    ],
    selfResponses: [],
    cooldownMs: 5e3,
    mediaKey: "roast"
  },
  {
    name: "simp",
    aliases: [],
    category: "fun",
    emoji: "[simp]",
    emoteName: "love",
    targetRequired: true,
    botTargetAllowed: true,
    selfTargetAllowed: false,
    responses: [
      "{author} simps for {target}!",
      "{author} is totally simping for {target}!",
      "{author} throws hearts at {target}!"
    ],
    botResponses: [
      "AshenAI's simp subroutine... does not compute. Beep boop.",
      "AshenAI is immune to simping. Nice try though!"
    ],
    selfResponses: [],
    cooldownMs: 5e3,
    mediaKey: "simp"
  }
];
const actionByName = /* @__PURE__ */ new Map();
const actionByAlias = /* @__PURE__ */ new Map();
for (const action of ACTIONS) {
  actionByName.set(action.name, action);
  for (const alias of action.aliases) {
    actionByAlias.set(alias, action);
  }
}
function getAction(input) {
  const lower = input.toLowerCase();
  return actionByName.get(lower) ?? actionByAlias.get(lower);
}
function getAllActions() {
  return [...ACTIONS];
}
function getActionsByCategory(category) {
  return ACTIONS.filter((a) => a.category === category);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAction,
  getActionsByCategory,
  getAllActions,
  resolveResponse
});
