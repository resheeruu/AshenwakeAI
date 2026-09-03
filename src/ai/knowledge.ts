import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { readJSON, writeJSON } from "../core/data-store";
import { createFuzzySearch, type SearchResult } from "./fuzzy-search";

export interface KnowledgeEntry {
  id: string;
  guildId: string;
  title: string;
  content: string;
  category: "rules" | "faq" | "guide" | "custom";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

interface KnowledgeStore {
  entries: Record<string, KnowledgeEntry>;
}

const KNOWLEDGE_FILE = "knowledge-data.json";

export class GuildKnowledge {
  private store: KnowledgeStore;
  private searchIndex = new Map<string, ReturnType<typeof createFuzzySearch<KnowledgeEntry>>>();

  constructor() {
    this.store = readJSON<KnowledgeStore>(KNOWLEDGE_FILE, { entries: {} });
  }

  private save(): void {
    writeJSON(KNOWLEDGE_FILE, this.store);
    this.searchIndex.clear();
  }

  private getSearchIndex(guildId: string): ReturnType<typeof createFuzzySearch<KnowledgeEntry>> {
    const existing = this.searchIndex.get(guildId);
    if (existing) return existing;

    const entries = this.getGuildEntries(guildId);
    const index = createFuzzySearch(entries, ["title", "content", "tags"], {
      threshold: 0.4,
    });
    this.searchIndex.set(guildId, index);
    return index;
  }

  add(entry: Omit<KnowledgeEntry, "id" | "createdAt" | "updatedAt">): KnowledgeEntry {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const full: KnowledgeEntry = {
      ...entry, id, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.store.entries[id] = full;
    this.save();
    return full;
  }

  update(id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "content" | "category" | "tags">>): KnowledgeEntry | null {
    const entry = this.store.entries[id];
    if (!entry) return null;
    Object.assign(entry, updates, { updatedAt: Date.now() });
    this.save();
    return entry;
  }

  delete(id: string): boolean {
    if (!this.store.entries[id]) return false;
    delete this.store.entries[id];
    this.save();
    return true;
  }

  get(id: string, guildId?: string): KnowledgeEntry | undefined {
    const entry = this.store.entries[id];
    if (!entry) return undefined;
    if (guildId && entry.guildId !== guildId) return undefined;
    return entry;
  }

  getGuildEntries(guildId: string, category?: string): KnowledgeEntry[] {
    return Object.values(this.store.entries).filter(
      (e) => e.guildId === guildId && (!category || e.category === category)
    );
  }

  search(guildId: string, query: string): KnowledgeEntry[] {
    const index = this.getSearchIndex(guildId);
    const results = index(query);
    return results.slice(0, 10).map((r) => r.item);
  }

  getContext(guildId: string, query: string, maxEntries = 5): string {
    const matches = this.search(guildId, query).slice(0, maxEntries);
    if (matches.length === 0) return "";
    return matches.map((e) => `[${e.category.toUpperCase()}] ${e.title}: ${e.content}`).join("\n\n");
  }

  rebuildIndex(guildId: string): void {
    this.searchIndex.delete(guildId);
  }
}
