import { readJSON, writeJSON } from "../core/data-store";
import { logger } from "../logger";

export type TicketType = "support" | "reports" | "appeals" | "partnerships" | "applications" | "staff";
export type TicketStatus = "open" | "triaging" | "waiting" | "claimed" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface Ticket {
  id: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string;
  description: string;
  claimedBy?: string;
  aiAssisted: boolean;
  messages: TicketMessage[];
  transcript?: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface TicketMessage {
  id: string;
  authorId: string;
  content: string;
  isAI: boolean;
  timestamp: number;
}

interface TicketStore {
  tickets: Record<string, Ticket>;
}

const TICKETS_FILE = "tickets.json";

export class TicketManager {
  private store: TicketStore;

  constructor() {
    this.store = readJSON<TicketStore>(TICKETS_FILE, { tickets: {} });
  }

  private save(): void {
    writeJSON(TICKETS_FILE, this.store);
  }

  createTicket(params: {
    guildId: string;
    channelId: string;
    creatorId: string;
    type: TicketType;
    subject: string;
    description: string;
  }): Ticket {
    const id = `ticket-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const ticket: Ticket = {
      id, ...params, status: "open", priority: "medium",
      aiAssisted: true, messages: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.store.tickets[id] = ticket;
    this.save();
    logger.info(`🎫 Ticket ${id} created in ${params.guildId} by ${params.creatorId}`);
    return ticket;
  }

  getTicket(id: string, guildId?: string): Ticket | undefined {
    const ticket = this.store.tickets[id];
    if (!ticket) return undefined;
    if (guildId && ticket.guildId !== guildId) return undefined;
    return ticket;
  }

  getGuildTickets(guildId: string, status?: TicketStatus): Ticket[] {
    return Object.values(this.store.tickets)
      .filter((t) => t.guildId === guildId && (!status || t.status === status))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getUserTickets(guildId: string, userId: string): Ticket[] {
    return Object.values(this.store.tickets)
      .filter((t) => t.guildId === guildId && t.creatorId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  claimTicket(id: string, staffId: string): boolean {
    const ticket = this.store.tickets[id];
    if (!ticket || ticket.status === "claimed" || ticket.status === "closed") return false;
    ticket.claimedBy = staffId;
    ticket.status = "claimed";
    ticket.updatedAt = Date.now();
    this.save();
    return true;
  }

  closeTicket(id: string, reason?: string): boolean {
    const ticket = this.store.tickets[id];
    if (!ticket) return false;
    ticket.status = "closed";
    ticket.closedAt = Date.now();
    ticket.updatedAt = Date.now();
    if (reason) {
      ticket.messages.push({
        id: Date.now().toString(36),
        authorId: "system",
        content: `Ticket closed: ${reason}`,
        isAI: false,
        timestamp: Date.now(),
      });
    }
    this.save();
    return true;
  }

  addMessage(ticketId: string, authorId: string, content: string, isAI = false): TicketMessage | null {
    const ticket = this.store.tickets[ticketId];
    if (!ticket) return null;
    const msg: TicketMessage = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      authorId, content, isAI, timestamp: Date.now(),
    };
    ticket.messages.push(msg);
    ticket.updatedAt = Date.now();
    this.save();
    return msg;
  }

  getStats(guildId: string): { total: number; open: number; byType: Record<string, number>; avgResponseTime: number } {
    const tickets = this.getGuildTickets(guildId);
    const byType: Record<string, number> = {};
    for (const t of tickets) byType[t.type] = (byType[t.type] || 0) + 1;
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === "open" || t.status === "triaging").length,
      byType,
      avgResponseTime: 0,
    };
  }
}
