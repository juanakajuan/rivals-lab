import { MAPS, type GameMode, type MapEntry } from "./maps";

export type CompMapSelection =
  | { readonly mapIds: readonly string[]; readonly gameMode: null }
  | { readonly mapIds: readonly never[]; readonly gameMode: GameMode };

export type CompMapChoice =
  | { readonly kind: "any" }
  | {
      readonly kind: "maps";
      readonly maps: readonly [MapEntry, ...MapEntry[]];
    }
  | { readonly kind: "mode"; readonly mode: GameMode };

export function selectedCompMaps(
  selection: CompMapSelection,
): readonly MapEntry[] {
  const mapIds: readonly string[] = selection.mapIds;
  return MAPS.filter((map) => mapIds.includes(map.id));
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
      return choice.maps.map((map) => map.shortName).join(", ");
    case "mode":
      return `${choice.mode} · Any map in mode`;
  }
}
