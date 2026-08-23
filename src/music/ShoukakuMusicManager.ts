import { Connectors, Shoukaku, type NodeOption } from "shoukaku";
import type { Client } from "discord.js";

export class ShoukakuMusicManager {
  public readonly shoukaku: Shoukaku;

  constructor(
    client: Client,
    lavalink: {
      url: string;
      auth: string;
      secure: boolean;
      name: string;
    },
  ) {
    const connector = new Connectors.DiscordJS(client);

    const node: NodeOption = {
      name: lavalink.name,
      url: lavalink.url,
      auth: lavalink.auth,
      secure: lavalink.secure,
    };

    this.shoukaku = new Shoukaku(connector, [node], {
      reconnectTries: 10,
      reconnectInterval: 5,
      resume: true,
      resumeTimeout: 30,
      resumeByLibrary: true,
      moveOnDisconnect: true,
    });

    this.shoukaku.on("ready", (name) => {
      console.log(`🟢 LAVALINK READY: ${name}`);
    });

    this.shoukaku.on("error", (name, error) => {
      console.error(
        `❌ LAVALINK ERROR [${name}]:`,
        error instanceof Error ? error.message : String(error),
      );
    });

    this.shoukaku.on("close", (name, code, reason) => {
      console.warn(
        `⚠️ LAVALINK CLOSED [${name}]: code=${code} reason=${reason}`,
      );
    });

    this.shoukaku.on("debug", (name, message) => {
      console.log(`🔧 LAVALINK DEBUG [${name}]: ${message}`);
    });
  }
}
