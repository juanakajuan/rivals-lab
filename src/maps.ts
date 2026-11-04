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

export interface BoardStage {
  readonly id: string;
  readonly name: string;
  readonly image: BoardImage;
  readonly thumb: `/map-thumbs/${string}`;
}

export interface MapEntry {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly mode: GameMode;
  readonly stages: readonly [BoardStage, ...BoardStage[]];
  readonly preview?: PreviewImage;
  readonly legacyIds: readonly string[];
}

export const MAPS = [
  {
    id: "birnin-tchalla",
    name: "Intergalactic Empire of Wakanda: Birnin T'Challa",
    shortName: "Birnin T’Challa",
    mode: "Domination",
    stages: [
      {
        id: "birnin-tchalla-imperial-institute-of-science",
        name: "Imperial Institute of Science",
        image: {
          imagePath: "/maps/birnin-tchalla-imperial-institute-of-science.webp",
          width: 943,
          height: 2560,
        },
        thumb: "/map-thumbs/birnin-tchalla-imperial-institute-of-science.webp",
      },
      {
        id: "birnin-tchalla-spaceport",
        name: "Spaceport",
        image: {
          imagePath: "/maps/birnin-tchalla-spaceport.webp",
          width: 1729,
          height: 2560,
        },
        thumb: "/map-thumbs/birnin-tchalla-spaceport.webp",
      },
      {
        id: "birnin-tchalla-waterfall",
        name: "Waterfall",
        image: {
          imagePath: "/maps/birnin-tchalla-waterfall.webp",
          width: 2560,
          height: 2548,
        },
        thumb: "/map-thumbs/birnin-tchalla-waterfall.webp",
      },
    ],
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
    stages: [
      {
        id: "hells-heaven-airfield-base",
        name: "Airfield Base",
        image: {
          imagePath: "/maps/hells-heaven-airfield-base.webp",
          width: 2334,
          height: 2560,
        },
        thumb: "/map-thumbs/hells-heaven-airfield-base.webp",
      },
      {
        id: "hells-heaven-airfield-base-forward-view",
        name: "Airfield Base (forward view)",
        image: {
          imagePath: "/maps/hells-heaven-airfield-base-forward-view.webp",
          width: 2560,
          height: 1834,
        },
        thumb: "/map-thumbs/hells-heaven-airfield-base-forward-view.webp",
      },
      {
        id: "hells-heaven-monument",
        name: "Monument",
        image: {
          imagePath: "/maps/hells-heaven-monument.webp",
          width: 648,
          height: 2560,
        },
        thumb: "/map-thumbs/hells-heaven-monument.webp",
      },
      {
        id: "hells-heaven-super-soldier-factory",
        name: "Super Soldier Factory",
        image: {
          imagePath: "/maps/hells-heaven-super-soldier-factory.webp",
          width: 827,
          height: 2560,
        },
        thumb: "/map-thumbs/hells-heaven-super-soldier-factory.webp",
      },
    ],
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
    stages: [
      {
        id: "krakoa-carousel",
        name: "Carousel",
        image: {
          imagePath: "/maps/krakoa-carousel.webp",
          width: 1118,
          height: 2560,
        },
        thumb: "/map-thumbs/krakoa-carousel.webp",
      },
      {
        id: "krakoa-cradle",
        name: "Cradle",
        image: {
          imagePath: "/maps/krakoa-cradle.webp",
          width: 1219,
          height: 2560,
        },
        thumb: "/map-thumbs/krakoa-cradle.webp",
      },
      {
        id: "krakoa-grove",
        name: "Grove",
        image: {
          imagePath: "/maps/krakoa-grove.webp",
          width: 1928,
          height: 2560,
        },
        thumb: "/map-thumbs/krakoa-grove.webp",
      },
    ],
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
    stages: [
      {
        id: "celestial-husk-celestial-codex",
        name: "Celestial Codex",
        image: {
          imagePath: "/maps/celestial-husk-celestial-codex.webp",
          width: 1266,
          height: 2560,
        },
        thumb: "/map-thumbs/celestial-husk-celestial-codex.webp",
      },
      {
        id: "celestial-husk-celestial-hand",
        name: "Celestial Hand",
        image: {
          imagePath: "/maps/celestial-husk-celestial-hand.webp",
          width: 1432,
          height: 2560,
        },
        thumb: "/map-thumbs/celestial-husk-celestial-hand.webp",
      },
      {
        id: "celestial-husk-celestial-vault",
        name: "Celestial Vault",
        image: {
          imagePath: "/maps/celestial-husk-celestial-vault.webp",
          width: 2189,
          height: 2560,
        },
        thumb: "/map-thumbs/celestial-husk-celestial-vault.webp",
      },
    ],
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
    stages: [
      {
        id: "god-quarry-confessional-eternity",
        name: "Confessional Eternity",
        image: {
          imagePath: "/maps/god-quarry-confessional-eternity.webp",
          width: 951,
          height: 2560,
        },
        thumb: "/map-thumbs/god-quarry-confessional-eternity.webp",
      },
      {
        id: "god-quarry-halls-of-all-knowing",
        name: "Halls of All-Knowing",
        image: {
          imagePath: "/maps/god-quarry-halls-of-all-knowing.webp",
          width: 905,
          height: 2560,
        },
        thumb: "/map-thumbs/god-quarry-halls-of-all-knowing.webp",
      },
      {
        id: "god-quarry-house-of-ideas",
        name: "House of Ideas",
        image: {
          imagePath: "/maps/god-quarry-house-of-ideas.webp",
          width: 549,
          height: 2560,
        },
        thumb: "/map-thumbs/god-quarry-house-of-ideas.webp",
      },
    ],
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
    id: "royal-palace",
    name: "Yggsgard: Royal Palace",
    shortName: "Royal Palace",
    mode: "Domination",
    stages: [
      {
        id: "royal-palace-archive",
        name: "Archive",
        image: {
          imagePath: "/maps/royal-palace-archive.webp",
          width: 852,
          height: 2560,
        },
        thumb: "/map-thumbs/royal-palace-archive.webp",
      },
      {
        id: "royal-palace-bifrost-garden",
        name: "Bifrost Garden",
        image: {
          imagePath: "/maps/royal-palace-bifrost-garden.webp",
          width: 838,
          height: 2560,
        },
        thumb: "/map-thumbs/royal-palace-bifrost-garden.webp",
      },
      {
        id: "royal-palace-throne-room",
        name: "Throne Room",
        image: {
          imagePath: "/maps/royal-palace-throne-room.webp",
          width: 809,
          height: 2560,
        },
        thumb: "/map-thumbs/royal-palace-throne-room.webp",
      },
    ],
    legacyIds: [],
  },
  {
    id: "yggdrasill-path",
    name: "Yggdrasill Path",
    shortName: "Yggdrasill Path",
    mode: "Convoy",
    stages: [
      {
        id: "yggdrasill-path",
        name: "Yggdrasill Path",
        image: {
          imagePath: "/maps/yggdrasill-path.webp",
          width: 1944,
          height: 2560,
        },
        thumb: "/map-thumbs/yggdrasill-path.webp",
      },
    ],
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
    stages: [
      {
        id: "spider-islands",
        name: "Spider-Islands",
        image: {
          imagePath: "/maps/spider-islands.webp",
          width: 1724,
          height: 2560,
        },
        thumb: "/map-thumbs/spider-islands.webp",
      },
    ],
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
    stages: [
      {
        id: "midtown",
        name: "Damaged",
        image: {
          imagePath: "/maps/midtown.webp",
          width: 1974,
          height: 2560,
        },
        thumb: "/map-thumbs/midtown.webp",
      },
    ],
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
    stages: [
      {
        id: "arakko",
        name: "Arakko",
        image: {
          imagePath: "/maps/arakko.webp",
          width: 2560,
          height: 1904,
        },
        thumb: "/map-thumbs/arakko.webp",
      },
    ],
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
    stages: [
      {
        id: "museum-of-contemplation",
        name: "Museum of Contemplation",
        image: {
          imagePath: "/maps/museum-of-contemplation.webp",
          width: 2092,
          height: 2560,
        },
        thumb: "/map-thumbs/museum-of-contemplation.webp",
      },
    ],
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
    stages: [
      {
        id: "thebes",
        name: "Thebes",
        image: {
          imagePath: "/maps/thebes.webp",
          width: 1301,
          height: 2560,
        },
        thumb: "/map-thumbs/thebes.webp",
      },
    ],
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
    stages: [
      {
        id: "hall-of-djalia",
        name: "Hall of Djalia",
        image: {
          imagePath: "/maps/hall-of-djalia.webp",
          width: 1002,
          height: 2560,
        },
        thumb: "/map-thumbs/hall-of-djalia.webp",
      },
    ],
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
    stages: [
      {
        id: "symbiotic-surface",
        name: "Symbiotic Surface",
        image: {
          imagePath: "/maps/symbiotic-surface.webp",
          width: 2229,
          height: 2560,
        },
        thumb: "/map-thumbs/symbiotic-surface.webp",
      },
    ],
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
    stages: [
      {
        id: "central-park-damaged",
        name: "Damaged",
        image: {
          imagePath: "/maps/central-park-damaged.webp",
          width: 1886,
          height: 2560,
        },
        thumb: "/map-thumbs/central-park-damaged.webp",
      },
      {
        id: "central-park-repaired",
        name: "Repaired",
        image: {
          imagePath: "/maps/central-park-repaired.webp",
          width: 2560,
          height: 2359,
        },
        thumb: "/map-thumbs/central-park-repaired.webp",
      },
    ],
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
    stages: [
      {
        id: "heart-of-heaven",
        name: "Heart of Heaven",
        image: {
          imagePath: "/maps/heart-of-heaven.webp",
          width: 1276,
          height: 2560,
        },
        thumb: "/map-thumbs/heart-of-heaven.webp",
      },
    ],
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
    stages: [
      {
        id: "shin-shibuya",
        name: "Shin-Shibuya",
        image: {
          imagePath: "/maps/shin-shibuya.webp",
          width: 1680,
          height: 1568,
        },
        thumb: "/map-thumbs/shin-shibuya.webp",
      },
    ],
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
    stages: [
      {
        id: "lower-manhattan",
        name: "Lower Manhattan",
        image: {
          imagePath: "/maps/lower-manhattan.webp",
          width: 1401,
          height: 2560,
        },
        thumb: "/map-thumbs/lower-manhattan.webp",
      },
    ],
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
export type CatalogStage = CatalogMap["stages"][number];
export type BuiltinBoardMapId = CatalogStage["id"];

export const DEFAULT_MAP_ID: BuiltinBoardMapId =
  "birnin-tchalla-imperial-institute-of-science";

export interface CatalogBoard {
  readonly map: CatalogMap;
  readonly stage: CatalogStage;
}

const BOARDS_BY_STORED_ID: ReadonlyMap<string, CatalogBoard> = new Map(
  MAPS.flatMap((map): (readonly [string, CatalogBoard])[] => [
    ...map.stages.map((stage) => [stage.id, { map, stage }] as const),
    ...[map.id, ...map.legacyIds].map(
      (id) => [id, { map, stage: map.stages[0] }] as const,
    ),
  ]),
);

export function findMap(storedId: string): CatalogMap | undefined {
  return BOARDS_BY_STORED_ID.get(storedId)?.map;
}

export function findBoardMap(storedId: string): CatalogBoard | undefined {
  return BOARDS_BY_STORED_ID.get(storedId);
}
