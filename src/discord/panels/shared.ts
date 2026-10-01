import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";

export const BRAND = 0x7c3aed;

/**
 * Custom-id prefixes owned by the persistent control panels. The
 * global interaction router in index.ts dispatches on these; they
 * must never collide with game/tool prefixes (`ashen_*`, `help_*`).
 */
export const PANEL_PREFIXES = {
  support: "support:",
  mod: "mod:",
  server: "server:",
} as const;

export type PanelPrefix = (typeof PANEL_PREFIXES)[keyof typeof PANEL_PREFIXES];

export function isPanelCustomId(customId: string): boolean {
  return (
    customId.startsWith(PANEL_PREFIXES.support) ||
    customId.startsWith(PANEL_PREFIXES.mod) ||
    customId.startsWith(PANEL_PREFIXES.server)
  );
}

/**
 * Shared [Home] / [Close] (and optional [Back]) navigation row.
 * Every panel view attaches this so a user is never stuck on a
 * sub-view.
 */
export function panelNavRow(
  prefix: string,
  opts: { home?: boolean; back?: boolean } = {},
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (opts.back !== false) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}back`)
        .setLabel("← Back")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (opts.home !== false) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}home`)
        .setLabel("🏠 Home")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}close`)
      .setLabel("✖ Close")
      .setStyle(ButtonStyle.Danger),
  );
  return row;
}

export function closedPanelEmbed(title: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`🔒 ${title} closed`)
    .setDescription("Panel closed. Re-run the command to open it again.")
    .setColor(0x6b7280);
}

/**
 * Responder abstraction: panel component handlers use update() so the
 * message itself re-renders; test harnesses capture payloads instead.
 */
export interface PanelResponder {
  deny(content: string): Promise<void>;
  show(payload: {
    content?: string;
    embeds?: EmbedBuilder[];
    components?: ActionRowBuilder<any>[];
  }): Promise<void>;
}

export function makeInteractionResponder(interaction: {
  reply: (p: { content: string; flags: MessageFlags.Ephemeral }) => Promise<unknown>;
  update: (p: unknown) => Promise<unknown>;
}): PanelResponder {
  return {
    deny: async (content) => {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    },
    show: async (payload) => {
      await interaction.update(payload);
    },
  };
}
