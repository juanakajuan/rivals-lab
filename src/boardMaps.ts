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

async function hasRasterHeader(file: File): Promise<boolean> {
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
  if (
    accepted.reduce((total, map) => total + map.sourceBytes, file.size) >
    TOTAL_BYTES_LIMIT
  )
    return {
      kind: "error",
      message:
        "This tab has a 50 MiB total image limit. Reload to start again.",
    };
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
    if (
      accepted.reduce((total, map) => total + map.sourcePixels, sourcePixels) >
      TOTAL_PIXELS_LIMIT
    )
      return {
        kind: "error",
        message:
          "This tab has an 80 million pixel total image limit. Reload to start again.",
      };
    const scale = Math.max(
      1200 / Math.max(width, height),
      300 / Math.min(width, height),
    );
    return {
      kind: "ready",
      map: {
        kind: "custom",
        id: `custom:${crypto.randomUUID()}`,
        name: file.name,
        mode: "Custom image",
        imagePath,
        width: width * scale,
        height: height * scale,
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
