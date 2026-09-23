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
var ticket_manager_exports = {};
__export(ticket_manager_exports, {
  TicketManager: () => TicketManager
});
module.exports = __toCommonJS(ticket_manager_exports);
var import_data_store = require("../core/data-store");
var import_logger = require("../logger");
const TICKETS_FILE = "tickets.json";
class TicketManager {
  store;
  constructor() {
    this.store = (0, import_data_store.readJSON)(TICKETS_FILE, { tickets: {} });
  }
  save() {
    (0, import_data_store.writeJSON)(TICKETS_FILE, this.store);
  }
  createTicket(params) {
    const id = `ticket-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const ticket = {
      id,
      ...params,
      status: "open",
      priority: "medium",
      aiAssisted: true,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.store.tickets[id] = ticket;
    this.save();
    import_logger.logger.info(`\u{1F3AB} Ticket ${id} created in ${params.guildId} by ${params.creatorId}`);
    return ticket;
  }
  getTicket(id, guildId) {
    const ticket = this.store.tickets[id];
    if (!ticket) return void 0;
    if (guildId && ticket.guildId !== guildId) return void 0;
    return ticket;
  }
  getGuildTickets(guildId, status) {
    return Object.values(this.store.tickets).filter((t) => t.guildId === guildId && (!status || t.status === status)).sort((a, b) => b.createdAt - a.createdAt);
  }
  getUserTickets(guildId, userId) {
    return Object.values(this.store.tickets).filter((t) => t.guildId === guildId && t.creatorId === userId).sort((a, b) => b.createdAt - a.createdAt);
  }
  claimTicket(id, staffId) {
    const ticket = this.store.tickets[id];
    if (!ticket || ticket.status === "claimed" || ticket.status === "closed") return false;
    ticket.claimedBy = staffId;
    ticket.status = "claimed";
    ticket.updatedAt = Date.now();
    this.save();
    return true;
  }
  closeTicket(id, reason) {
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
        timestamp: Date.now()
      });
    }
    this.save();
    return true;
  }
  addMessage(ticketId, authorId, content, isAI = false) {
    const ticket = this.store.tickets[ticketId];
    if (!ticket) return null;
    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      authorId,
      content,
      isAI,
      timestamp: Date.now()
    };
    ticket.messages.push(msg);
    ticket.updatedAt = Date.now();
    this.save();
    return msg;
  }
  getStats(guildId) {
    const tickets = this.getGuildTickets(guildId);
    const byType = {};
    for (const t of tickets) byType[t.type] = (byType[t.type] || 0) + 1;
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === "open" || t.status === "triaging").length,
      byType,
      avgResponseTime: 0
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TicketManager
});
