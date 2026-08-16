export type GuildUpgradeId =
  | "treasury"
  | "training_grounds"
  | "marketplace"
  | "castle"
  | "magic_tower";

export type GuildMember = {
  userId: string;
  username: string;
  joinedAt: number;
  contribution: number;
  role: "leader" | "officer" | "member";
};

export type GuildUpgrade = {
  id: GuildUpgradeId;
  name: string;
  level: number;
  maxLevel: number;
  cost: number;
  power: number;
  description: string;
};

export type Guild = {
  id: string;
  name: string;
  leaderId: string;
  level: number;
  power: number;
  treasury: number;
  members: GuildMember[];
  upgrades: GuildUpgrade[];
  createdAt: number;
  wins: number;
  losses: number;
};

const XP_PER_GUILD_LEVEL = 1000;

export const GUILD_UPGRADES: GuildUpgrade[] = [
  {
    id: "treasury",
    name: "🏦 Treasury",
    level: 0,
    maxLevel: 10,
    cost: 1000,
    power: 100,
    description: "Increases guild treasury capacity.",
  },
  {
    id: "training_grounds",
    name: "⚔️ Training Grounds",
    level: 0,
    maxLevel: 10,
    cost: 1500,
    power: 200,
    description: "Improves guild combat power.",
  },
  {
    id: "marketplace",
    name: "🏪 Marketplace",
    level: 0,
    maxLevel: 10,
    cost: 2000,
    power: 150,
    description: "Improves guild trading benefits.",
  },
  {
    id: "castle",
    name: "🏰 Castle",
    level: 0,
    maxLevel: 10,
    cost: 5000,
    power: 500,
    description: "Provides a major guild power increase.",
  },
  {
    id: "magic_tower",
    name: "🔮 Magic Tower",
    level: 0,
    maxLevel: 10,
    cost: 7500,
    power: 750,
    description: "Unlocks future guild magic systems.",
  },
];

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(
    Math.random() * 100000,
  )}`;
}

export function createGuild(
  leaderId: string,
  username: string,
  name: string,
): Guild {
  const trimmedName = name.trim();

  if (
    trimmedName.length < 2 ||
    trimmedName.length > 32
  ) {
    throw new Error("INVALID_GUILD_NAME");
  }

  const upgrades = GUILD_UPGRADES.map(
    (upgrade) => ({ ...upgrade }),
  );

  return {
    id: randomId("guild"),
    name: trimmedName,
    leaderId,
    level: 1,
    power: 0,
    treasury: 0,
    members: [
      {
        userId: leaderId,
        username,
        joinedAt: Date.now(),
        contribution: 0,
        role: "leader",
      },
    ],
    upgrades,
    createdAt: Date.now(),
    wins: 0,
    losses: 0,
  };
}

export function isGuildMember(
  guild: Guild,
  userId: string,
): boolean {
  return guild.members.some(
    (member) => member.userId === userId,
  );
}

export function getGuildMember(
  guild: Guild,
  userId: string,
): GuildMember | undefined {
  return guild.members.find(
    (member) => member.userId === userId,
  );
}

export function addGuildMember(
  guild: Guild,
  userId: string,
  username: string,
): void {
  if (isGuildMember(guild, userId)) {
    throw new Error("ALREADY_IN_GUILD");
  }

  guild.members.push({
    userId,
    username,
    joinedAt: Date.now(),
    contribution: 0,
    role: "member",
  });

  recalculateGuildPower(guild);
}

export function removeGuildMember(
  guild: Guild,
  userId: string,
): void {
  if (userId === guild.leaderId) {
    throw new Error("LEADER_CANNOT_LEAVE");
  }

  const index = guild.members.findIndex(
    (member) => member.userId === userId,
  );

  if (index < 0) {
    throw new Error("NOT_IN_GUILD");
  }

  guild.members.splice(index, 1);

  recalculateGuildPower(guild);
}

export function depositGuildTreasury(
  guild: Guild,
  userId: string,
  amount: number,
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_DEPOSIT");
  }

  const member = getGuildMember(guild, userId);

  if (!member) {
    throw new Error("NOT_IN_GUILD");
  }

  const contribution = Math.floor(amount);

  guild.treasury += contribution;
  member.contribution += contribution;

  checkGuildLevelUp(guild);
  recalculateGuildPower(guild);
}

export function getGuildUpgrade(
  guild: Guild,
  upgradeId: GuildUpgradeId,
): GuildUpgrade {
  const upgrade = guild.upgrades.find(
    (entry) => entry.id === upgradeId,
  );

  if (!upgrade) {
    throw new Error("INVALID_GUILD_UPGRADE");
  }

  return upgrade;
}

export function upgradeGuild(
  guild: Guild,
  userId: string,
  upgradeId: GuildUpgradeId,
): GuildUpgrade {
  if (guild.leaderId !== userId) {
    throw new Error("GUILD_LEADER_ONLY");
  }

  const upgrade = getGuildUpgrade(
    guild,
    upgradeId,
  );

  if (upgrade.level >= upgrade.maxLevel) {
    throw new Error("UPGRADE_MAXED");
  }

  const price =
    upgrade.cost * (upgrade.level + 1);

  if (guild.treasury < price) {
    throw new Error("GUILD_NOT_ENOUGH_TREASURY");
  }

  guild.treasury -= price;
  upgrade.level += 1;

  recalculateGuildPower(guild);

  return upgrade;
}

export function checkGuildLevelUp(
  guild: Guild,
): boolean {
  const oldLevel = guild.level;

  while (
    guild.treasury >=
    guild.level * XP_PER_GUILD_LEVEL
  ) {
    guild.level += 1;
  }

  return guild.level > oldLevel;
}

export function recalculateGuildPower(
  guild: Guild,
): number {
  const memberPower = guild.members.reduce(
    (total, member) =>
      total + Math.floor(member.contribution / 100),
    0,
  );

  const upgradePower = guild.upgrades.reduce(
    (total, upgrade) =>
      total + upgrade.level * upgrade.power,
    0,
  );

  guild.power =
    memberPower +
    upgradePower +
    guild.level * 100;

  return guild.power;
}

export function recordGuildWin(
  guild: Guild,
): void {
  guild.wins += 1;
  recalculateGuildPower(guild);
}

export function recordGuildLoss(
  guild: Guild,
): void {
  guild.losses += 1;
  recalculateGuildPower(guild);
}

export function getGuildLeaderboard(
  guilds: Guild[],
): Guild[] {
  return [...guilds].sort(
    (a, b) => b.power - a.power,
  );
}

export function getGuildRank(
  guilds: Guild[],
  guildId: string,
): number {
  const leaderboard =
    getGuildLeaderboard(guilds);

  const index = leaderboard.findIndex(
    (guild) => guild.id === guildId,
  );

  return index < 0 ? 0 : index + 1;
}
