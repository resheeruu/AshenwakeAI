import { readJSON, writeJSON } from "../core/data-store";
import { logger } from "../logger";

export interface CommunityEvent {
  id: string;
  guildId: string;
  creatorId: string;
  title: string;
  description: string;
  startTime: number;
  endTime?: number;
  location?: string;
  participants: string[];
  maxParticipants?: number;
  recurring: boolean;
  recurringPattern?: "daily" | "weekly" | "monthly";
  createdAt: number;
}

interface EventStore { events: Record<string, CommunityEvent>; }

const EVENTS_FILE = "community-events.json";

export class EventManager {
  private store: EventStore;

  constructor() {
    this.store = readJSON<EventStore>(EVENTS_FILE, { events: {} });
  }

  private save(): void { writeJSON(EVENTS_FILE, this.store); }

  createEvent(params: Omit<CommunityEvent, "id" | "participants" | "createdAt">): CommunityEvent {
    const id = `evt-${Date.now().toString(36)}`;
    const event: CommunityEvent = { ...params, id, participants: [], createdAt: Date.now() };
    this.store.events[id] = event;
    this.save();
    return event;
  }

  joinEvent(id: string, userId: string): boolean {
    const event = this.store.events[id];
    if (!event) return false;
    if (event.maxParticipants && event.participants.length >= event.maxParticipants) return false;
    if (!event.participants.includes(userId)) event.participants.push(userId);
    this.save();
    return true;
  }

  leaveEvent(id: string, userId: string): boolean {
    const event = this.store.events[id];
    if (!event) return false;
    event.participants = event.participants.filter((u) => u !== userId);
    this.save();
    return true;
  }

  getGuildEvents(guildId: string): CommunityEvent[] {
    return Object.values(this.store.events)
      .filter((e) => e.guildId === guildId)
      .sort((a, b) => a.startTime - b.startTime);
  }

  getUpcoming(guildId: string): CommunityEvent[] {
    const now = Date.now();
    return this.getGuildEvents(guildId).filter((e) => e.startTime > now);
  }

  deleteEvent(id: string): boolean {
    if (!this.store.events[id]) return false;
    delete this.store.events[id];
    this.save();
    return true;
  }
}
