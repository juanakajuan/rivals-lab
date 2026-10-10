import {
  isMapChoice,
  type MapPickerEntry,
  type MapPickerOption,
} from "./MapPicker";
import { COMP_MAPS } from "./compMaps";
import { getMap, type MapId } from "./maps";

/** Every planning map, in catalog order. Maps without an overhead image stay visible as placeholders. */
export const BOARD_MAP_PICKER_OPTIONS: readonly MapPickerEntry<MapId>[] =
  COMP_MAPS.map((map): MapPickerEntry<MapId> => {
    if (map.boardMapId === undefined) {
      return {
        placeholder: true,
        id: map.id,
        name: map.name,
        detail: map.mode,
      };
    }
    const board = getMap(map.boardMapId);
    return {
      value: map.boardMapId,
      name: board.name,
      detail: board.mode,
      imagePath: board.imagePath,
      imageSize: [board.width, board.height],
    };
  });

export const BOARD_MAP_OPTIONS: readonly MapPickerOption<MapId>[] =
  BOARD_MAP_PICKER_OPTIONS.filter(isMapChoice);

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
