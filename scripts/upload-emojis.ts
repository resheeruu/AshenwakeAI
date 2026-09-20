/**
 * upload-emojis.ts
 *
 * Uploads the converted PNG emojis to a Discord guild as custom emoji.
 * Requires DISCORD_TOKEN and DISCORD_GUILD_ID env vars.
 *
 * Run: npm run upload:emojis
 *
 * After upload, emoji IDs are written to assets/emojis/emoji-manifest.json.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config/env";
import { ICON_MAP, ICON_NAMES, LOGICAL_TO_LEGACY } from "../src/discord/icons";

const PNG_DIR = join(__dirname, "..", "assets", "emojis", "png");
const MANIFEST_PATH = join(__dirname, "..", "assets", "emojis", "emoji-manifest.json");

interface DiscordEmoji {
  id: string;
  name: string;
}

async function uploadEmoji(
  token: string,
  guildId: string,
  name: string,
  imagePath: string,
): Promise<DiscordEmoji | null> {
  const pngBuffer = readFileSync(imagePath);
  const formData = new FormData();
  formData.append("file", new Blob([pngBuffer], { type: "image/png" }), `${name}.png`);
  formData.append("name", name);

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/emojis`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`  FAIL ${name}: HTTP ${response.status} — ${text}`);
      return null;
    }

    const data = await response.json() as DiscordEmoji;
    console.log(`  OK   ${name} → ID: ${data.id}`);
    return data;
  } catch (err: any) {
    console.error(`  FAIL ${name}: ${err.message}`);
    return null;
  }
}

async function main() {
  const token = config.discord.token;
  const guildId = config.discord.guildId;

  if (!guildId) {
    console.error("DISCORD_GUILD_ID is required. Set it in .env or as an env var.");
    process.exit(1);
  }

  const pngs = readdirSync(PNG_DIR).filter((f) => f.endsWith(".png"));
  console.log(`Uploading ${pngs.length} emojis to guild ${guildId}...\n`);

  const results: Partial<Record<string, string>> = {};

  for (const png of pngs) {
    // Support both legacy "ash_*" and logical naming
    const rawName = png.replace(/\.png$/, "");
    const logicalName = rawName.startsWith("ash_")
      ? rawName.slice(4)
      : rawName;

    // Only upload icons that are in our configuration
    if (!ICON_NAMES.includes(logicalName as any)) {
      console.warn(`  SKIP ${rawName} (not in icon config)`);
      continue;
    }

    // Use legacy name for Discord (maintains compatibility with existing uploads)
    const discordName = LOGICAL_TO_LEGACY[logicalName as keyof typeof LOGICAL_TO_LEGACY] ?? rawName;
    const imagePath = join(PNG_DIR, png);
    const result = await uploadEmoji(token, guildId, discordName, imagePath);
    if (result) {
      // Store under both legacy and logical name for compatibility
      results[discordName] = result.id;
      results[logicalName] = result.id;
    }
  }

  // Write manifest
  const manifest = {
    guildId,
    emojis: results,
    uploadedAt: new Date().toISOString(),
  };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to ${MANIFEST_PATH}`);
  console.log(`Uploaded ${Object.keys(results).length / 2}/${pngs.length} emojis.`);

  // Print env vars for convenience
  console.log("\n# Add these to your .env file:");
  for (const name of ICON_NAMES) {
    const legacyName = LOGICAL_TO_LEGACY[name];
    const id = results[legacyName];
    if (id) {
      const envVar = ICON_MAP[name].envVar;
      console.log(`${envVar}=${id}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
