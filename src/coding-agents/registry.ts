import { CodingAgent } from "./types";

export class CodingAgentRegistry {
  private readonly agents = new Map<string, CodingAgent>();

  register(agent: CodingAgent): void {
    this.agents.set(agent.name, agent);
  }

  get(name: string): CodingAgent | undefined {
    return this.agents.get(name);
  }

  getAll(): CodingAgent[] {
    return Array.from(this.agents.values());
  }

  async getAvailable(): Promise<CodingAgent[]> {
    const available: CodingAgent[] = [];

    for (const agent of this.agents.values()) {
      try {
        if (await agent.isAvailable()) {
          available.push(agent);
        }
      } catch {
        // An unavailable agent must not break the registry.
      }
    }

    return available;
  }
}
