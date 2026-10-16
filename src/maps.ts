export const GAME_MODES = ["Domination", "Convoy", "Convergence"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export function isGameMode(value: unknown): value is GameMode {
  return GAME_MODES.some((mode) => mode === value);
}

export interface BoardImage {
  readonly imagePath: `/maps/${string}`;
  readonly width: number;
  readonly height: number;
}

export interface PreviewImage {
  readonly imagePath: `/map-previews/${string}`;
  readonly size: readonly [width: number, height: number];
  readonly cardPosition: `${number}% ${number}%`;
  readonly source: string;
  readonly sourceImage: string;
}

export interface MapEntry {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly mode: GameMode;
  readonly board?: BoardImage;
  readonly preview?: PreviewImage;
  readonly legacyIds: readonly string[];
}

export const MAPS = [
  {
    id: "birnin-tchalla",
    name: "Intergalactic Empire of Wakanda: Birnin T'Challa",
    shortName: "Birnin T’Challa",
    mode: "Domination",
    board: {
      imagePath: "/maps/birnin-tchalla-domination.png",
      width: 1200,
      height: 654,
    },
    preview: {
      imagePath: "/map-previews/birnin-tchalla.webp",
      size: [1920, 803],
      cardPosition: "50% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/06/064d1764fa34d9d20e7bad4cd50f82528f0a37f7251b19c99c2b7c105818114b?width=1920&format=webp",
    },
    legacyIds: ["birnin-tchalla-domination"],
  },
  {
    id: "hells-heaven",
    name: "Hydra Charteris Base: Hell's Heaven",
    shortName: "Hell’s Heaven",
    mode: "Domination",
    board: {
      imagePath: "/maps/hells-heaven-domination.png",
      width: 1200,
      height: 657,
    },
    preview: {
      imagePath: "/map-previews/hells-heaven.webp",
      size: [1720, 720],
      cardPosition: "50% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/be/be711c685ca8a45d28abb34b938e162ab62239050fbdc2f69e1f3a86e894793c?width=1920&format=webp",
    },
    legacyIds: ["hells-heaven-domination"],
  },
  {
    id: "krakoa",
    name: "Cradle: Krakoa",
    shortName: "Krakoa",
    mode: "Domination",
    board: {
      imagePath: "/maps/krakoa-domination.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/krakoa.webp",
      size: [1720, 720],
      cardPosition: "55% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/36/3660f6073607e66fc03989341899442d47a7a91d8da8e568bcb7984700c41bd4?width=1920&format=webp",
    },
    legacyIds: ["krakoa-domination"],
  },
  {
    id: "celestial-husk",
    name: "Celestial Husk",
    shortName: "Celestial Husk",
    mode: "Domination",
    preview: {
      imagePath: "/map-previews/celestial-husk.webp",
      size: [1720, 720],
      cardPosition: "0% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/94/9421f2507dc5da1ff2df49ce91e9d149f0fda4e5c9c5efb221b4e9192214643b?width=1920&format=webp",
    },
    legacyIds: [],
  },
  {
    id: "god-quarry",
    name: "The God Quarry",
    shortName: "The God Quarry",
    mode: "Domination",
    preview: {
      imagePath: "/map-previews/god-quarry.jpg",
      size: [3840, 2160],
      cardPosition: "50% 50%",
      source:
        "https://www.marvelrivals.com/gameupdate/20260923/41548_1314808.html",
      sourceImage:
        "https://r.res.easebar.com/pic/20260923/a02e6206-2674-423c-b7d6-c9b8897d5493.jpg",
    },
    legacyIds: [],
  },
  {
    id: "yggdrasill-path",
    name: "Yggdrasill Path",
    shortName: "Yggdrasill Path",
    mode: "Convoy",
    board: {
      imagePath: "/maps/yggdrasill-path-convoy.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/yggdrasill-path.webp",
      size: [1920, 804],
      cardPosition: "30% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/27/27994289b38bc1a3847e1749a405d7f98bc5ffa0963e79343391add35bdef903?width=1920&format=webp",
    },
    legacyIds: ["yggdrasill-path-convoy"],
  },
  {
    id: "spider-islands",
    name: "Spider-Islands",
    shortName: "Spider-Islands",
    mode: "Convoy",
    board: {
      imagePath: "/maps/spider-islands-convoy.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/spider-islands.webp",
      size: [1920, 804],
      cardPosition: "50% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/89/89e98d3771836a35f29b794bc3c1f966848446c50d6adb926e4bbac6af6c6d0c?width=1920&format=webp",
    },
    legacyIds: ["spider-islands-convoy"],
  },
  {
    id: "midtown",
    name: "Midtown",
    shortName: "Midtown",
    mode: "Convoy",
    board: {
      imagePath: "/maps/midtown-convoy.webp",
      width: 1200,
      height: 657,
    },
    preview: {
      imagePath: "/map-previews/midtown.webp",
      size: [1920, 803],
      cardPosition: "40% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/ea/ea27a332476f53c81ade20cc72c29b14610ade4550949caa088bd6fc1ff83942?width=1920&format=webp",
    },
    legacyIds: ["midtown-convoy"],
  },
  {
    id: "arakko",
    name: "Arakko",
    shortName: "Arakko",
    mode: "Convoy",
    board: {
      imagePath: "/maps/arakko-convoy.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/arakko.webp",
      size: [1720, 720],
      cardPosition: "25% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/fd/fd7f5cbab5a77642617f9ea9064e1d5ade19df7146fdd530b43200ccdc08b71f?width=1920&format=webp",
    },
    legacyIds: ["arakko-convoy"],
  },
  {
    id: "museum-of-contemplation",
    name: "Museum of Contemplation",
    shortName: "Museum of Contemplation",
    mode: "Convoy",
    board: {
      imagePath: "/maps/museum-of-contemplation-convoy.png",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/museum-of-contemplation.jpg",
      size: [1920, 1080],
      cardPosition: "65% 50%",
      source: "https://www.marvelrivals.com/",
      sourceImage:
        "https://www.marvelrivals.com/pc/gw/20241128194803/img/9_d1e6afd2.jpg",
    },
    legacyIds: ["museum-of-contemplation-convoy"],
  },
  {
    id: "thebes",
    name: "Thebes",
    shortName: "Thebes",
    mode: "Convoy",
    board: {
      imagePath: "/maps/thebes-convoy.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/thebes.jpg",
      size: [3840, 2160],
      cardPosition: "50% 50%",
      source: "https://www.marvelrivals.com/",
      sourceImage:
        "https://www.marvelrivals.com/pc/gw/20241128194803/img/21_484fcb82.jpg",
    },
    legacyIds: ["thebes-convoy"],
  },
  {
    id: "hall-of-djalia",
    name: "Hall of Djalia",
    shortName: "Hall of Djalia",
    mode: "Convergence",
    board: {
      imagePath: "/maps/hall-of-djalia-convergence.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/hall-of-djalia.webp",
      size: [1720, 720],
      cardPosition: "70% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/cd/cd50b84ea530f375646a0816a73fd43890cdeeefe9c981e8fc36019643665633?width=1920&format=webp",
    },
    legacyIds: ["hall-of-djalia-convergence"],
  },
  {
    id: "symbiotic-surface",
    name: "Symbiotic Surface",
    shortName: "Symbiotic Surface",
    mode: "Convergence",
    board: {
      imagePath: "/maps/symbiotic-surface-convergence.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/symbiotic-surface.webp",
      size: [1720, 720],
      cardPosition: "60% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/ec/ec6f2ca3907eda791a2b9ae8663e82890cfb83d32523ed3839773fe8cd86b7c6?width=1920&format=webp",
    },
    legacyIds: ["symbiotic-surface-convergence"],
  },
  {
    id: "central-park",
    name: "Central Park",
    shortName: "Central Park",
    mode: "Convergence",
    board: {
      imagePath: "/maps/central-park-convergence.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/central-park.webp",
      size: [1720, 720],
      cardPosition: "90% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/e5/e5b3bd805a1b1dc64f1d6bd3b20edbd2aeeee4f4fecd06c455201e3f287da9aa?width=1920&format=webp",
    },
    legacyIds: ["central-park-convergence"],
  },
  {
    id: "heart-of-heaven",
    name: "Heart of Heaven",
    shortName: "Heart of Heaven",
    mode: "Convergence",
    board: {
      imagePath: "/maps/heart-of-heaven-convergence.webp",
      width: 1200,
      height: 658,
    },
    preview: {
      imagePath: "/map-previews/heart-of-heaven.webp",
      size: [1720, 720],
      cardPosition: "50% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/61/612d0330b49ef2aa298d43f747849e82de28eeed08d42389dc895d9d3eec72a7?width=1920&format=webp",
    },
    legacyIds: ["heart-of-heaven-convergence"],
  },
  {
    id: "shin-shibuya",
    name: "Shin-Shibuya",
    shortName: "Shin-Shibuya",
    mode: "Convergence",
    board: {
      imagePath: "/maps/shin-shibuya-convergence.webp",
      width: 1200,
      height: 657,
    },
    preview: {
      imagePath: "/map-previews/shin-shibuya.webp",
      size: [1720, 720],
      cardPosition: "65% 50%",
      source: "https://psylocke.gg/assets?category=map-bg",
      sourceImage:
        "https://cdn.psylocke.gg/marvel-rivals/objects/26/267eb5feafc3cca72fb2bf1e0ec05457fdad56ea768aae773ded6cb09bdb191d?width=1920&format=webp",
    },
    legacyIds: ["shin-shibuya-convergence"],
  },
  {
    id: "lower-manhattan",
    name: "Lower Manhattan",
    shortName: "Lower Manhattan",
    mode: "Convergence",
    board: {
      imagePath: "/maps/lower-manhattan-convergence.webp",
      width: 1200,
      height: 657,
    },
    preview: {
      imagePath: "/map-previews/lower-manhattan.jpg",
      size: [3840, 2160],
      cardPosition: "90% 50%",
      source: "https://www.marvelrivals.com/",
      sourceImage:
        "https://www.marvelrivals.com/pc/gw/20241128194803/img/18_bd1c448f.jpg",
    },
    legacyIds: ["lower-manhattan-convergence"],
  },
] as const satisfies readonly MapEntry[];

export type CatalogMap = (typeof MAPS)[number];
export type MapId = CatalogMap["id"];

export const BOARD_MAPS = MAPS.filter((map) => "board" in map);
export type BoardMap = (typeof BOARD_MAPS)[number];
export type BuiltinBoardMapId = BoardMap["id"];

export const DEFAULT_MAP_ID: BuiltinBoardMapId = "birnin-tchalla";

const MAPS_BY_STORED_ID: ReadonlyMap<string, CatalogMap> = new Map(
  MAPS.flatMap((map) => [map.id, ...map.legacyIds].map((id) => [id, map])),
);

export function findMap(storedId: string): CatalogMap | undefined {
  return MAPS_BY_STORED_ID.get(storedId);
}

export function findBoardMap(storedId: string): BoardMap | undefined {
  const map = findMap(storedId);
  return map && "board" in map ? map : undefined;
}

export function getBoardMap(id: BuiltinBoardMapId): BoardMap {
  const map = findBoardMap(id);
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}
