import { getMap, type MapDefinition, type MapId } from "./maps";

export type CustomBoardMapId = `custom:${string}`;
export type BoardMapId = MapId | CustomBoardMapId;

export interface CustomBoardMap extends Omit<MapDefinition, "id" | "mode"> {
  readonly kind: "custom";
  readonly id: CustomBoardMapId;
  readonly mode: "Custom image";
  readonly sourceBytes: number;
  readonly sourcePixels: number;
}

export type SelectedBoardMap =
  { readonly kind: "builtin"; readonly id: MapId } | CustomBoardMap;

export type BoardMapDefinition = MapDefinition | CustomBoardMap;

export type BoardMapUpload =
  | { readonly kind: "ready"; readonly map: CustomBoardMap }
  | { readonly kind: "error"; readonly message: string };

export function resolveBoardMap(map: SelectedBoardMap): BoardMapDefinition {
  return map.kind === "builtin" ? getMap(map.id) : map;
}

const FILE_LIMIT = 10 * 1024 * 1024;
const TOTAL_BYTES_LIMIT = 50 * 1024 * 1024;
const PIXEL_LIMIT = 24_000_000;
const TOTAL_PIXELS_LIMIT = 80_000_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const CUSTOM_MAP_ID =
  /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_DATA_URL =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

function scaledSize(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.max(
    1200 / Math.max(width, height),
    300 / Math.min(width, height),
  );
  return { width: width * scale, height: height * scale };
}

export function customMapBudgetError(
  maps: readonly Pick<CustomBoardMap, "sourceBytes" | "sourcePixels">[],
): string | null {
  if (
    maps.reduce((total, map) => total + map.sourceBytes, 0) > TOTAL_BYTES_LIMIT
  )
    return "Custom maps have a 50 MiB total image limit. This browser has reached its custom map limit.";
  if (
    maps.reduce((total, map) => total + map.sourcePixels, 0) >
    TOTAL_PIXELS_LIMIT
  )
    return "Custom maps have an 80 million pixel total image limit. This browser has reached its custom map limit.";
  return null;
}

function positiveInteger(value: unknown, limit: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > limit
  )
    throw new Error("Invalid custom map size.");
  return value;
}

function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error("Invalid custom map size.");
  return value;
}

function isCustomMapId(value: unknown): value is CustomBoardMapId {
  return typeof value === "string" && CUSTOM_MAP_ID.test(value);
}

export function decodeCustomMap(value: unknown): CustomBoardMap {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid custom map.");
  const map: Partial<Record<string, unknown>> = value;
  const { id, name, imagePath } = map;
  if (map.kind !== "custom" || map.mode !== "Custom image")
    throw new Error("Invalid custom map.");
  if (!isCustomMapId(id)) throw new Error("Invalid custom map ID.");
  if (typeof name !== "string" || !name || name.length > 255)
    throw new Error("Invalid custom map name.");
  if (typeof imagePath !== "string" || !IMAGE_DATA_URL.test(imagePath))
    throw new Error(`The image for ${name} is not a supported image.`);
  return {
    kind: "custom",
    id,
    name,
    mode: "Custom image",
    imagePath,
    width: positive(map.width),
    height: positive(map.height),
    sourceBytes: positiveInteger(map.sourceBytes, FILE_LIMIT),
    sourcePixels: positiveInteger(map.sourcePixels, PIXEL_LIMIT),
  };
}

export async function verifyCustomMapImages(
  maps: readonly CustomBoardMap[],
): Promise<void> {
  const budgetError = customMapBudgetError(maps);
  if (budgetError) throw new Error(budgetError);
  for (const map of maps) {
    const unreadable = new Error(`The image for ${map.name} cannot be read.`);
    const image = await (await fetch(map.imagePath)).blob();
    if (image.size !== map.sourceBytes || !(await hasRasterHeader(image)))
      throw unreadable;
    const element = new Image();
    element.src = map.imagePath;
    try {
      await element.decode();
    } catch {
      throw unreadable;
    }
    const expected = scaledSize(element.naturalWidth, element.naturalHeight);
    if (
      element.naturalWidth * element.naturalHeight !== map.sourcePixels ||
      Math.abs(expected.width - map.width) > 0.01 ||
      Math.abs(expected.height - map.height) > 0.01
    )
      throw unreadable;
  }
}

async function hasRasterHeader(file: Blob): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = (bytes: readonly number[], offset = 0): boolean =>
    bytes.every((byte, index) => header[index + offset] === byte);
  switch (file.type) {
    case "image/png":
      return matches([137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/jpeg":
      return matches([255, 216, 255]);
    case "image/webp":
      return matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8);
    case "image/gif":
      return (
        matches([71, 73, 70, 56]) &&
        (header[4] === 55 || header[4] === 57) &&
        header[5] === 97
      );
    default:
      return false;
  }
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Cannot read image."));
    reader.onabort = () => reject(new Error("Image reading stopped."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Cannot read image."));
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadBoardMap(
  file: File,
  accepted: readonly CustomBoardMap[],
): Promise<BoardMapUpload> {
  if (!IMAGE_TYPES.includes(file.type))
    return {
      kind: "error",
      message: "Choose a PNG, JPEG, WebP, or GIF image.",
    };
  if (file.size > FILE_LIMIT)
    return { kind: "error", message: "Choose an image of 10 MiB or less." };
  const bytesError = customMapBudgetError([
    ...accepted,
    { sourceBytes: file.size, sourcePixels: 0 },
  ]);
  if (bytesError) return { kind: "error", message: bytesError };
  try {
    if (!(await hasRasterHeader(file)))
      return {
        kind: "error",
        message: "Cannot read this image. Choose another file.",
      };
    const imagePath = await readImage(file);
    const image = new Image();
    image.src = imagePath;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const sourcePixels = width * height;
    if (
      !Number.isFinite(sourcePixels) ||
      width <= 0 ||
      height <= 0 ||
      sourcePixels > PIXEL_LIMIT
    )
      return {
        kind: "error",
        message:
          "Choose an image with valid dimensions and at most 24 million pixels.",
      };
    const pixelsError = customMapBudgetError([
      ...accepted,
      { sourceBytes: file.size, sourcePixels },
    ]);
    if (pixelsError) return { kind: "error", message: pixelsError };
    return {
      kind: "ready",
      map: {
        kind: "custom",
        id: `custom:${crypto.randomUUID()}`,
        name: file.name,
        mode: "Custom image",
        imagePath,
        ...scaledSize(width, height),
        sourceBytes: file.size,
        sourcePixels,
      },
    };
  } catch {
    return {
      kind: "error",
      message: "Cannot read this image. Choose another file.",
    };
  }
}
