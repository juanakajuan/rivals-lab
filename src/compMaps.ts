import type { GameMode, MapId } from "./maps";

interface CompMap {
  readonly id: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly previewImagePath: string;
  readonly previewImageSize: readonly [width: number, height: number];
  readonly selectedCardPosition: `${number}% ${number}%`;
  readonly boardMapId?: MapId;
}

export const COMP_MAPS: readonly CompMap[] = [
  {
    id: "birnin-tchalla",
    previewImagePath: "/map-previews/birnin-tchalla.webp",
    previewImageSize: [1920, 803],
    selectedCardPosition: "50% 50%",
    name: "Birnin T’Challa",
    mode: "Domination",
    boardMapId: "birnin-tchalla-domination",
  },
  {
    id: "hells-heaven",
    previewImagePath: "/map-previews/hells-heaven.webp",
    previewImageSize: [1720, 720],
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
    previewImageSize: [1720, 720],
    selectedCardPosition: "55% 50%",
    boardMapId: "krakoa-domination",
  },
  {
    id: "celestial-husk",
    name: "Celestial Husk",
    mode: "Domination",
    previewImagePath: "/map-previews/celestial-husk.webp",
    previewImageSize: [1720, 720],
    selectedCardPosition: "0% 50%",
  },
  {
    id: "god-quarry",
    name: "The God Quarry",
    mode: "Domination",
    previewImagePath: "/map-previews/god-quarry.jpg",
    previewImageSize: [3840, 2160],
    selectedCardPosition: "50% 50%",
  },
  {
    id: "yggdrasill-path",
    name: "Yggdrasill Path",
    mode: "Convoy",
    previewImagePath: "/map-previews/yggdrasill-path.webp",
    previewImageSize: [1920, 804],
    selectedCardPosition: "30% 50%",
    boardMapId: "yggdrasill-path-convoy",
  },
  {
    id: "spider-islands",
    name: "Spider-Islands",
    mode: "Convoy",
    previewImagePath: "/map-previews/spider-islands.webp",
    previewImageSize: [1920, 804],
    selectedCardPosition: "50% 50%",
    boardMapId: "spider-islands-convoy",
  },
  {
    id: "midtown",
    name: "Midtown",
    mode: "Convoy",
    previewImagePath: "/map-previews/midtown.webp",
    previewImageSize: [1920, 803],
    selectedCardPosition: "40% 50%",
    boardMapId: "midtown-convoy",
  },
  {
    id: "arakko",
    name: "Arakko",
    mode: "Convoy",
    previewImagePath: "/map-previews/arakko.webp",
    previewImageSize: [1720, 720],
    selectedCardPosition: "25% 50%",
    boardMapId: "arakko-convoy",
  },
  {
    id: "museum-of-contemplation",
    previewImagePath: "/map-previews/museum-of-contemplation.jpg",
    previewImageSize: [1920, 1080],
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
    previewImageSize: [3840, 2160],
    selectedCardPosition: "50% 50%",
    boardMapId: "thebes-convoy",
  },
  {
    id: "hall-of-djalia",
    name: "Hall of Djalia",
    mode: "Convergence",
    previewImagePath: "/map-previews/hall-of-djalia.webp",
    previewImageSize: [1720, 720],
    selectedCardPosition: "70% 50%",
    boardMapId: "hall-of-djalia-convergence",
  },
  {
    id: "symbiotic-surface",
    name: "Symbiotic Surface",
    mode: "Convergence",
    previewImagePath: "/map-previews/symbiotic-surface.webp",
    previewImageSize: [1720, 720],
    selectedCardPosition: "60% 50%",
    boardMapId: "symbiotic-surface-convergence",
  },
  {
    id: "central-park",
    name: "Central Park",
    mode: "Convergence",
    previewImagePath: "/map-previews/central-park.webp",
    previewImageSize: [1720, 720],
    selectedCardPosition: "90% 50%",
    boardMapId: "central-park-convergence",
  },
  {
    id: "heart-of-heaven",
    name: "Heart of Heaven",
    mode: "Convergence",
    previewImagePath: "/map-previews/heart-of-heaven.webp",
    previewImageSize: [1720, 720],
    selectedCardPosition: "50% 50%",
    boardMapId: "heart-of-heaven-convergence",
  },
  {
    id: "shin-shibuya",
    name: "Shin-Shibuya",
    mode: "Convergence",
    previewImagePath: "/map-previews/shin-shibuya.webp",
    previewImageSize: [1720, 720],
    selectedCardPosition: "65% 50%",
    boardMapId: "shin-shibuya-convergence",
  },
  {
    id: "lower-manhattan",
    name: "Lower Manhattan",
    mode: "Convergence",
    previewImagePath: "/map-previews/lower-manhattan.jpg",
    previewImageSize: [3840, 2160],
    selectedCardPosition: "90% 50%",
    boardMapId: "lower-manhattan-convergence",
  },
];

export type CompMapSelection =
  | { readonly mapIds: readonly string[]; readonly gameMode: null }
  | { readonly mapIds: readonly never[]; readonly gameMode: GameMode };

export type CompMapChoice =
  | { readonly kind: "any" }
  | { readonly kind: "maps"; readonly maps: readonly [CompMap, ...CompMap[]] }
  | { readonly kind: "mode"; readonly mode: GameMode };

export function selectedCompMaps(
  selection: CompMapSelection,
): readonly CompMap[] {
  const mapIds: readonly string[] = selection.mapIds;
  return COMP_MAPS.filter((map) => mapIds.includes(map.id));
}

export function compMapChoice(selection: CompMapSelection): CompMapChoice {
  if (selection.gameMode !== null)
    return { kind: "mode", mode: selection.gameMode };
  const [first, ...rest] = selectedCompMaps(selection);
  return first ? { kind: "maps", maps: [first, ...rest] } : { kind: "any" };
}

export function compMapLabel(selection: CompMapSelection): string {
  const choice = compMapChoice(selection);
  switch (choice.kind) {
    case "any":
      return "Any map";
    case "maps":
      return choice.maps.map((map) => map.name).join(", ");
    case "mode":
      return `${choice.mode} · Any map in mode`;
  }
}
