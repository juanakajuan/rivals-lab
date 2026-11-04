import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: npm run maps:import -- <source dir>";
const BOARD_SIDE = 2560;
const THUMB_SIDE = 480;
const STATIC = fileURLToPath(new URL("../static/", import.meta.url));
const BOARD_DIR = join(STATIC, "maps");
const THUMB_DIR = join(STATIC, "map-thumbs");

const STAGE_SOURCES: Readonly<Record<string, string>> = {
  arakko: "Arakko",
  "birnin-tchalla-imperial-institute-of-science":
    "Birnin T'Challa - Imperial Institute of Science",
  "birnin-tchalla-spaceport": "Birnin T'Challa - Spaceport",
  "birnin-tchalla-waterfall": "Birnin T'Challa - Waterfall",
  "celestial-husk-celestial-codex": "Celestial Husk - Celestial Codex",
  "celestial-husk-celestial-hand": "Celestial Husk - Celestial Hand",
  "celestial-husk-celestial-vault": "Celestial Husk - Celestial Vault",
  "central-park-damaged": "Central Park (Damaged)",
  "central-park-repaired": "Central Park (Repaired)",
  "god-quarry-confessional-eternity": "God Quarry - Confessional Eternity",
  "god-quarry-halls-of-all-knowing": "God Quarry - Halls of All-Knowing",
  "god-quarry-house-of-ideas": "God Quarry - House of Ideas",
  "hall-of-djalia": "Hall of Djalia",
  "heart-of-heaven": "Heart of Heaven",
  "hells-heaven-airfield-base": "Hell's Heaven - Airfield Base",
  "hells-heaven-airfield-base-forward-view":
    "Hell's Heaven - Airfield Base (forward view)",
  "hells-heaven-monument": "Hell's Heaven - Monument",
  "hells-heaven-super-soldier-factory": "Hell's Heaven - Super Soldier Factory",
  "krakoa-carousel": "Krakoa - Carousel",
  "krakoa-cradle": "Krakoa - Cradle",
  "krakoa-grove": "Krakoa - Grove",
  "lower-manhattan": "Lower Manhattan",
  midtown: "Midtown (Damaged)",
  "museum-of-contemplation": "Museum of Contemplation",
  "royal-palace-archive": "Royal Palace - Archive",
  "royal-palace-bifrost-garden": "Royal Palace - Bifrost Garden",
  "royal-palace-throne-room": "Royal Palace - Throne Room",
  "shin-shibuya": "Shin-Shibuya",
  "spider-islands": "Spider-Islands",
  "symbiotic-surface": "Symbiotic Surface",
  thebes: "Thebes",
  "yggdrasill-path": "Yggdrasill Path",
};

function encodeWebp(source: string, target: string, side: number): void {
  execFileSync(
    "magick",
    [
      source,
      "-resize",
      `${side}x${side}>`,
      "-quality",
      "80",
      "-define",
      "webp:alpha-quality=90",
      "-define",
      "webp:method=6",
      target,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

function pixelSize(path: string): readonly [width: number, height: number] {
  const [width, height] = execFileSync(
    "magick",
    ["identify", "-format", "%w %h", path],
    { encoding: "utf8" },
  )
    .split(" ")
    .map(Number);
  if (!width || !height) throw new Error(`Cannot read the size of ${path}`);
  return [width, height];
}

function removeUnused(directory: string): void {
  for (const file of readdirSync(directory)) {
    const id = file.replace(/\.webp$/, "");
    if (file.endsWith(".webp") && id in STAGE_SOURCES) continue;
    rmSync(join(directory, file));
    console.log(`removed ${join(directory, file)}`);
  }
}

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error(USAGE);
  process.exit(1);
}
mkdirSync(BOARD_DIR, { recursive: true });
mkdirSync(THUMB_DIR, { recursive: true });
removeUnused(BOARD_DIR);
removeUnused(THUMB_DIR);
console.log("stage id\twidth\theight");
for (const [id, name] of Object.entries(STAGE_SOURCES)) {
  const source = join(sourceDir, `${name}.webp`);
  if (!existsSync(source)) throw new Error(`Missing source image: ${source}`);
  const board = join(BOARD_DIR, `${id}.webp`);
  encodeWebp(source, board, BOARD_SIDE);
  encodeWebp(board, join(THUMB_DIR, `${id}.webp`), THUMB_SIDE);
  const [width, height] = pixelSize(board);
  console.log(`${id}\t${width}\t${height}`);
}
