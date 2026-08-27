import { readJSON, writeJSON } from "../core/data-store";
import { logger } from "../logger";

export interface ReactionRoleConfig {
  id: string;
  guildId: string;
  messageId: string;
  channelId: string;
  roles: Array<{ emoji: string; roleId: string }>;
  createdAt: number;
}

interface RRStore { configs: Record<string, ReactionRoleConfig>; }

const RR_FILE = "reaction-roles.json";

export class ReactionRoleManager {
  private store: RRStore;

  constructor() {
    this.store = readJSON<RRStore>(RR_FILE, { configs: {} });
  }

  private save(): void { writeJSON(RR_FILE, this.store); }

  createConfig(config: Omit<ReactionRoleConfig, "id" | "createdAt">): ReactionRoleConfig {
    const id = `rr-${Date.now().toString(36)}`;
    const full: ReactionRoleConfig = { ...config, id, createdAt: Date.now() };
    this.store.configs[id] = full;
    this.save();
    return full;
  }

  findByMessage(messageId: string): ReactionRoleConfig | undefined {
    return Object.values(this.store.configs).find((c) => c.messageId === messageId);
  }

  deleteConfig(id: string): boolean {
    if (!this.store.configs[id]) return false;
    delete this.store.configs[id];
    this.save();
    return true;
  }

  getGuildConfigs(guildId: string): ReactionRoleConfig[] {
    return Object.values(this.store.configs).filter((c) => c.guildId === guildId);
  }
}
