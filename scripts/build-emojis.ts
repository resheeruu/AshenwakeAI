/**
 * build-emojis.ts
 *
 * Converts Tabler SVG icons to Discord-ready PNGs (128x128, transparent bg).
 * Uses @resvg/resvg-js for pure-WASM SVG→PNG rendering (Termux-friendly).
 *
 * Colors are read from src/discord/icons.ts — edit that file to change them.
 *
 * Run: npm run build:emojis
 *
 * Output: assets/emojis/png/*.png
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ICON_MAP, ICON_NAMES, type IconName } from "../src/discord/icons";

let Resvg: any;
try {
  ({ Resvg } = require("@resvg/resvg-js"));
} catch {
  console.error(
    "ERROR: @resvg/resvg-js is required. Install with:\n" +
    "  npm install --no-save @resvg/resvg-js\n"
  );
  process.exit(1);
}

const SVG_DIR = join(__dirname, "..", "assets", "emojis", "svg");
const PNG_DIR = join(__dirname, "..", "assets", "emojis", "png");

const SIZE = 128;
const CIRCLE_R = 56; // radius of background circle
const ICON_SIZE = 64; // icon viewBox size inside the circle

function buildWrappedSvg(innerSvg: string, bgColor: string): string {
  // Strip the outer <svg> tag from the Tabler icon and extract just the paths
  const inner = innerSvg
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>/, "");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${CIRCLE_R}" fill="${bgColor}" />
  <g transform="translate(${(SIZE - ICON_SIZE) / 2}, ${(SIZE - ICON_SIZE) / 2})" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" color="#ffffff">
    ${inner}
  </g>
</svg>`;
}

function convertOne(name: IconName): boolean {
  const svgPath = join(SVG_DIR, `ash_${name}.svg`);
  const pngPath = join(PNG_DIR, `ash_${name}.png`);
  const config = ICON_MAP[name];

  if (!existsSync(svgPath)) {
    console.warn(`  SKIP ${name} (SVG not found)`);
    return false;
  }

  const rawSvg = readFileSync(svgPath, "utf-8");
  const bgColor = config.color;
  const wrappedSvg = buildWrappedSvg(rawSvg, bgColor);

  try {
    const resvg = new Resvg(wrappedSvg, {
      fitTo: { mode: "width", value: SIZE },
      background: "transparent",
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    writeFileSync(pngPath, pngBuffer);
    console.log(`  OK   ash_${name}.png (${pngBuffer.length} bytes)`);
    return true;
  } catch (err: any) {
    console.error(`  FAIL ash_${name}: ${err.message}`);
    return false;
  }
}

function main() {
  mkdirSync(PNG_DIR, { recursive: true });

  console.log(`Converting ${ICON_NAMES.length} SVGs to PNGs (${SIZE}x${SIZE})...\n`);

  let ok = 0;
  let fail = 0;

  for (const name of ICON_NAMES) {
    if (convertOne(name)) ok++;
    else fail++;
  }

  // Also convert any local custom SVGs not in ICON_MAP
  if (existsSync(SVG_DIR)) {
    const localSvgs = readdirSync(SVG_DIR)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.replace(/^ash_/, "").replace(/\.svg$/, ""))
      .filter((name): name is string => !ICON_NAMES.includes(name as IconName));

    for (const name of localSvgs) {
      const svgPath = join(SVG_DIR, `ash_${name}.svg`);
      const pngPath = join(PNG_DIR, `ash_${name}.png`);

      if (!existsSync(svgPath)) continue;

      const rawSvg = readFileSync(svgPath, "utf-8");
      const wrappedSvg = buildWrappedSvg(rawSvg, "#7c3aed"); // Default brand purple

      try {
        const resvg = new Resvg(wrappedSvg, {
          fitTo: { mode: "width", value: SIZE },
          background: "transparent",
        });
        const pngData = resvg.render();
        const pngBuffer = pngData.asPng();
        writeFileSync(pngPath, pngBuffer);
        console.log(`  OK   ash_${name}.png (custom, ${pngBuffer.length} bytes)`);
        ok++;
      } catch (err: any) {
        console.error(`  FAIL ash_${name}: ${err.message}`);
        fail++;
      }
    }
  }

  console.log(`\nDone: ${ok} converted, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main();
