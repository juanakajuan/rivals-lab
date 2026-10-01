import type { MapId, MapDefinition } from "./maps";

interface CompMap {
  readonly id: string;
  readonly name: string;
  readonly mode: MapDefinition["mode"];
  readonly previewImagePath: string;
  readonly boardMapId?: MapId;
}

/** Map names from the official Ignite Stage 2 pool, published 8 September 2026.
 * This is a planning list, not enforcement of an MRC event's map pool.
 */
export const COMP_MAPS: readonly CompMap[] = [
  {
    id: "birnin-tchalla",
    previewImagePath: "/map-previews/birnin-tchalla.webp",
    name: "Birnin T’Challa",
    mode: "Domination",
    boardMapId: "birnin-tchalla-domination",
  },
  {
    id: "hells-heaven",
    previewImagePath: "/map-previews/hells-heaven.webp",
    name: "Hell’s Heaven",
    mode: "Domination",
    boardMapId: "hells-heaven-domination",
  },
  {
    id: "krakoa",
    name: "Krakoa",
    mode: "Domination",
    previewImagePath: "/map-previews/krakoa.webp",
  },
  {
    id: "celestial-husk",
    name: "Celestial Husk",
    mode: "Domination",
    previewImagePath: "/map-previews/celestial-husk.webp",
  },
  {
    id: "yggdrasill-path",
    name: "Yggdrasill Path",
    mode: "Convoy",
    previewImagePath: "/map-previews/yggdrasill-path.webp",
  },
  {
    id: "spider-islands",
    name: "Spider-Islands",
    mode: "Convoy",
    previewImagePath: "/map-previews/spider-islands.webp",
  },
  {
    id: "midtown",
    name: "Midtown",
    mode: "Convoy",
    previewImagePath: "/map-previews/midtown.webp",
  },
  {
    id: "arakko",
    name: "Arakko",
    mode: "Convoy",
    previewImagePath: "/map-previews/arakko.webp",
  },
  {
    id: "museum-of-contemplation",
    previewImagePath: "/map-previews/museum-of-contemplation.jpg",
    name: "Museum of Contemplation",
    mode: "Convoy",
    boardMapId: "museum-of-contemplation-convoy",
  },
  {
    id: "thebes",
    name: "Thebes",
    mode: "Convoy",
    previewImagePath: "/map-previews/thebes.jpg",
  },
  {
    id: "hall-of-djalia",
    name: "Hall of Djalia",
    mode: "Convergence",
    previewImagePath: "/map-previews/hall-of-djalia.webp",
  },
  {
    id: "symbiotic-surface",
    name: "Symbiotic Surface",
    mode: "Convergence",
    previewImagePath: "/map-previews/symbiotic-surface.webp",
  },
  {
    id: "central-park",
    name: "Central Park",
    mode: "Convergence",
    previewImagePath: "/map-previews/central-park.webp",
  },
  {
    id: "heart-of-heaven",
    name: "Heart of Heaven",
    mode: "Convergence",
    previewImagePath: "/map-previews/heart-of-heaven.webp",
  },
  {
    id: "shin-shibuya",
    name: "Shin-Shibuya",
    mode: "Convergence",
    previewImagePath: "/map-previews/shin-shibuya.webp",
  },
  {
    id: "lower-manhattan",
    name: "Lower Manhattan",
    mode: "Convergence",
    previewImagePath: "/map-previews/lower-manhattan.jpg",
  },
];
