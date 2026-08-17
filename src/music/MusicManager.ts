import { Player } from "discord-player";

export class MusicManager {
  constructor(private readonly player: Player) {}

  getPlayer(): Player {
    return this.player;
  }
}
