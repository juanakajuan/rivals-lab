import type { MapPickerOption } from "./MapPicker";
import { COMP_MAPS } from "./compMaps";
import { MAPS, type MapId } from "./maps";

export const BOARD_MAP_OPTIONS: readonly MapPickerOption<MapId>[] = MAPS.map(
  (map) => ({
    value: map.id,
    name: map.name,
    detail: map.mode,
    imagePath: map.imagePath,
    imageSize: [map.width, map.height],
  }),
);

export const COMP_MAP_OPTIONS: readonly MapPickerOption<string | null>[] = [
  {
    value: null,
    name: "Any map",
    detail: "No map restriction",
    imagePath: null,
  },
  ...COMP_MAPS.map((map) => ({
    value: map.id,
    name: map.name,
    detail: map.mode,
    imagePath: map.previewImagePath,
    imageSize: map.previewImageSize,
  })),
];
