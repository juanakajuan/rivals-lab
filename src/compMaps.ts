import type { MapId, MapDefinition } from "./maps";

interface CompMap {
  readonly id: string;
  readonly name: string;
  readonly mode: MapDefinition["mode"];
  readonly previewImagePath: string;
  readonly selectedCardPosition: `${number}% ${number}%`;
  readonly boardMapId?: MapId;
}

/** Map names from the official Ignite Stage 2 pool, published 8 September 2026.
 * This is a planning list, not enforcement of an MRC event's map pool.
 */
export const COMP_MAPS: readonly CompMap[] = [
  {
    id: "birnin-tchalla",
    previewImagePath: "/map-previews/birnin-tchalla.webp",
    selectedCardPosition: "50% 50%",
    name: "Birnin T’Challa",
    mode: "Domination",
    boardMapId: "birnin-tchalla-domination",
  },
  {
    id: "hells-heaven",
    previewImagePath: "/map-previews/hells-heaven.webp",
    selectedCardPosition: "50% 50%",
    name: "Hell’s Heaven",
    mode: "Domination",
    boardMapId: "hells-heaven-domination",
  },
  {
    id: "krakoa",
    name: "Krakoa",
    mode: "Domination",
    previewImagePath: "/map-previews/krakoa.webp",
    selectedCardPosition: "55% 50%",
  },
  {
    id: "celestial-husk",
    name: "Celestial Husk",
    mode: "Domination",
    previewImagePath: "/map-previews/celestial-husk.webp",
    selectedCardPosition: "0% 50%",
  },
  {
    id: "yggdrasill-path",
    name: "Yggdrasill Path",
    mode: "Convoy",
    previewImagePath: "/map-previews/yggdrasill-path.webp",
    selectedCardPosition: "30% 50%",
  },
  {
    id: "spider-islands",
    name: "Spider-Islands",
    mode: "Convoy",
    previewImagePath: "/map-previews/spider-islands.webp",
    selectedCardPosition: "50% 50%",
  },
  {
    id: "midtown",
    name: "Midtown",
    mode: "Convoy",
    previewImagePath: "/map-previews/midtown.webp",
    selectedCardPosition: "40% 50%",
  },
  {
    id: "arakko",
    name: "Arakko",
    mode: "Convoy",
    previewImagePath: "/map-previews/arakko.webp",
    selectedCardPosition: "25% 50%",
  },
  {
    id: "museum-of-contemplation",
    previewImagePath: "/map-previews/museum-of-contemplation.jpg",
    selectedCardPosition: "65% 50%",
    name: "Museum of Contemplation",
    mode: "Convoy",
    boardMapId: "museum-of-contemplation-convoy",
  },
  {
    id: "thebes",
    name: "Thebes",
    mode: "Convoy",
    previewImagePath: "/map-previews/thebes.jpg",
    selectedCardPosition: "50% 50%",
  },
  {
    id: "hall-of-djalia",
    name: "Hall of Djalia",
    mode: "Convergence",
    previewImagePath: "/map-previews/hall-of-djalia.webp",
    selectedCardPosition: "70% 50%",
  },
  {
    id: "symbiotic-surface",
    name: "Symbiotic Surface",
    mode: "Convergence",
    previewImagePath: "/map-previews/symbiotic-surface.webp",
    selectedCardPosition: "60% 50%",
  },
  {
    id: "central-park",
    name: "Central Park",
    mode: "Convergence",
    previewImagePath: "/map-previews/central-park.webp",
    selectedCardPosition: "90% 50%",
  },
  {
    id: "heart-of-heaven",
    name: "Heart of Heaven",
    mode: "Convergence",
    previewImagePath: "/map-previews/heart-of-heaven.webp",
    selectedCardPosition: "50% 50%",
  },
  {
    id: "shin-shibuya",
    name: "Shin-Shibuya",
    mode: "Convergence",
    previewImagePath: "/map-previews/shin-shibuya.webp",
    selectedCardPosition: "65% 50%",
  },
  {
    id: "lower-manhattan",
    name: "Lower Manhattan",
    mode: "Convergence",
    previewImagePath: "/map-previews/lower-manhattan.jpg",
    selectedCardPosition: "90% 50%",
  },
];
