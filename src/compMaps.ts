import type { MapId, MapDefinition } from "./maps";

interface CompMap {
  readonly id: string;
  readonly name: string;
  readonly mode: MapDefinition["mode"];
  readonly boardMapId?: MapId;
}

/** Map names from the official Ignite Stage 2 pool, published 8 September 2026.
 * This is a planning list, not enforcement of an MRC event's map pool.
 */
export const COMP_MAPS: readonly CompMap[] = [
  {
    id: "birnin-tchalla",
    name: "Birnin T’Challa",
    mode: "Domination",
    boardMapId: "birnin-tchalla-domination",
  },
  {
    id: "hells-heaven",
    name: "Hell’s Heaven",
    mode: "Domination",
    boardMapId: "hells-heaven-domination",
  },
  { id: "krakoa", name: "Krakoa", mode: "Domination" },
  { id: "celestial-husk", name: "Celestial Husk", mode: "Domination" },
  { id: "yggdrasill-path", name: "Yggdrasill Path", mode: "Convoy" },
  { id: "spider-islands", name: "Spider-Islands", mode: "Convoy" },
  { id: "midtown", name: "Midtown", mode: "Convoy" },
  { id: "arakko", name: "Arakko", mode: "Convoy" },
  {
    id: "museum-of-contemplation",
    name: "Museum of Contemplation",
    mode: "Convoy",
    boardMapId: "museum-of-contemplation-convoy",
  },
  { id: "thebes", name: "Thebes", mode: "Convoy" },
  { id: "hall-of-djalia", name: "Hall of Djalia", mode: "Convergence" },
  { id: "symbiotic-surface", name: "Symbiotic Surface", mode: "Convergence" },
  { id: "central-park", name: "Central Park", mode: "Convergence" },
  { id: "heart-of-heaven", name: "Heart of Heaven", mode: "Convergence" },
  { id: "shin-shibuya", name: "Shin-Shibuya", mode: "Convergence" },
  { id: "lower-manhattan", name: "Lower Manhattan", mode: "Convergence" },
];
