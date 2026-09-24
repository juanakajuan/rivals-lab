export interface MapDefinition {
  readonly id: string;
  readonly name: string;
  readonly mode: "Domination" | "Convoy" | "Convergence";
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
