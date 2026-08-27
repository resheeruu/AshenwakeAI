import { readJSON, writeJSON } from "../core/data-store";
import { logger } from "../logger";

export interface Suggestion {
  id: string;
  guildId: string;
  authorId: string;
  content: string;
  status: "pending" | "approved" | "denied" | "implemented";
  votes: { up: string[]; down: string[] };
  staffNote?: string;
  createdAt: number;
  updatedAt: number;
}

interface SuggestionStore { suggestions: Record<string, Suggestion>; }

const SUGGESTIONS_FILE = "suggestions.json";

export class SuggestionManager {
  private store: SuggestionStore;

  constructor() {
    this.store = readJSON<SuggestionStore>(SUGGESTIONS_FILE, { suggestions: {} });
  }

  private save(): void { writeJSON(SUGGESTIONS_FILE, this.store); }

  create(guildId: string, authorId: string, content: string): Suggestion {
    const id = `sug-${Date.now().toString(36)}`;
    const sug: Suggestion = {
      id, guildId, authorId, content, status: "pending",
      votes: { up: [], down: [] }, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.store.suggestions[id] = sug;
    this.save();
    return sug;
  }

  vote(id: string, userId: string, type: "up" | "down"): boolean {
    const sug = this.store.suggestions[id];
    if (!sug) return false;
    sug.votes.up = sug.votes.up.filter((u) => u !== userId);
    sug.votes.down = sug.votes.down.filter((u) => u !== userId);
    sug.votes[type].push(userId);
    sug.updatedAt = Date.now();
    this.save();
    return true;
  }

  setStatus(id: string, status: Suggestion["status"], note?: string): boolean {
    const sug = this.store.suggestions[id];
    if (!sug) return false;
    sug.status = status;
    if (note) sug.staffNote = note;
    sug.updatedAt = Date.now();
    this.save();
    return true;
  }

  getGuildSuggestions(guildId: string, status?: string): Suggestion[] {
    return Object.values(this.store.suggestions)
      .filter((s) => s.guildId === guildId && (!status || s.status === status))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getTop(guildId: string, limit = 10): Suggestion[] {
    return this.getGuildSuggestions(guildId)
      .sort((a, b) => (b.votes.up.length - b.votes.down.length) - (a.votes.up.length - a.votes.down.length))
      .slice(0, limit);
  }
}
