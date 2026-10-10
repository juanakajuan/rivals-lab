export const GAME_MODES = ["Domination", "Convoy", "Convergence"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export function isGameMode(value: unknown): value is GameMode {
  return GAME_MODES.some((mode) => mode === value);
}

export interface MapDefinition {
  readonly id: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly imagePath: string;
  readonly width: number;
  readonly height: number;
}

export const MAPS = [
  {
    id: "birnin-tchalla-domination",
    name: "Intergalactic Empire of Wakanda: Birnin T'Challa",
    mode: "Domination",
    imagePath: "/maps/birnin-tchalla-domination.png",
    width: 1200,
    height: 654,
  },
  {
    id: "hells-heaven-domination",
    name: "Hydra Charteris Base: Hell's Heaven",
    mode: "Domination",
    imagePath: "/maps/hells-heaven-domination.png",
    width: 1200,
    height: 657,
  },
  {
    id: "krakoa-domination",
    name: "Cradle: Krakoa",
    mode: "Domination",
    imagePath: "/maps/krakoa-domination.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "yggdrasill-path-convoy",
    name: "Yggdrasill Path",
    mode: "Convoy",
    imagePath: "/maps/yggdrasill-path-convoy.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "spider-islands-convoy",
    name: "Spider-Islands",
    mode: "Convoy",
    imagePath: "/maps/spider-islands-convoy.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "midtown-convoy",
    name: "Midtown",
    mode: "Convoy",
    imagePath: "/maps/midtown-convoy.webp",
    width: 1200,
    height: 657,
  },
  {
    id: "arakko-convoy",
    name: "Arakko",
    mode: "Convoy",
    imagePath: "/maps/arakko-convoy.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "thebes-convoy",
    name: "Thebes",
    mode: "Convoy",
    imagePath: "/maps/thebes-convoy.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "hall-of-djalia-convergence",
    name: "Hall of Djalia",
    mode: "Convergence",
    imagePath: "/maps/hall-of-djalia-convergence.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "symbiotic-surface-convergence",
    name: "Symbiotic Surface",
    mode: "Convergence",
    imagePath: "/maps/symbiotic-surface-convergence.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "central-park-convergence",
    name: "Central Park",
    mode: "Convergence",
    imagePath: "/maps/central-park-convergence.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "heart-of-heaven-convergence",
    name: "Heart of Heaven",
    mode: "Convergence",
    imagePath: "/maps/heart-of-heaven-convergence.webp",
    width: 1200,
    height: 658,
  },
  {
    id: "shin-shibuya-convergence",
    name: "Shin-Shibuya",
    mode: "Convergence",
    imagePath: "/maps/shin-shibuya-convergence.webp",
    width: 1200,
    height: 657,
  },
  {
    id: "museum-of-contemplation-convoy",
    name: "Museum of Contemplation",
    mode: "Convoy",
    imagePath: "/maps/museum-of-contemplation-convoy.png",
    width: 1200,
    height: 658,
  },
] as const satisfies readonly MapDefinition[];

export type MapId = (typeof MAPS)[number]["id"];

export const DEFAULT_MAP_ID: MapId = "birnin-tchalla-domination";

export function getMap(mapId: MapId): MapDefinition {
  const map = MAPS.find((candidate) => candidate.id === mapId);
  if (!map) throw new Error(`Unknown map: ${mapId}`);
  return map;
}

export function isMapId(value: string): value is MapId {
  return MAPS.some((map) => map.id === value);
}
