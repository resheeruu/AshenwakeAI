export type ChaosResult = {
  title: string;
  description: string;
  coins: number;
  xp: number;
};

const EVENTS: ChaosResult[] = [
  {
    title: "🔥 Ashen Surge",
    description: "The Ashen realm recognizes your presence.",
    coins: 50,
    xp: 30,
  },
  {
    title: "💰 Lost Pouch",
    description: "You found a mysterious pouch of coins.",
    coins: 75,
    xp: 20,
  },
  {
    title: "👻 Ghost Encounter",
    description: "A ghost challenged you to survive the encounter.",
    coins: 25,
    xp: 45,
  },
  {
    title: "🍀 Lucky Moment",
    description: "Pure luck. Nothing more. Nothing less.",
    coins: 100,
    xp: 50,
  },
  {
    title: "💀 Ashen Curse",
    description: "Something went terribly wrong...",
    coins: -25,
    xp: 10,
  },
];

export function randomChaos(): ChaosResult {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}
