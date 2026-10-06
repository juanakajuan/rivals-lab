import type { MapDefinition } from "./maps";

interface DrawingBase {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
}
export type BoardDrawing = DrawingBase &
  (
    | { readonly kind: "arrow"; readonly dx: number; readonly dy: number }
    | { readonly kind: "zone"; readonly width: number; readonly height: number }
    | { readonly kind: "note"; readonly text: string }
  );
export type BoardTool = "move" | BoardDrawing["kind"];
export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}
export interface BoardSize {
  readonly width: number;
  readonly height: number;
}
export type MeasureBoardNote = (text: string) => BoardSize;

export const MAX_NOTE_LENGTH = 200;
export const MAX_DRAWINGS_PER_MAP = 2_000;

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Invalid drawing position or size.");
  return value;
}

function extent(value: unknown): number {
  const size = finite(value);
  if (size < 0) throw new Error("Invalid drawing position or size.");
  return size;
}

type DrawingFields = Partial<Record<string, unknown>>;

const DRAWING_DECODERS: {
  readonly [Kind in BoardDrawing["kind"]]: (
    base: DrawingBase,
    fields: DrawingFields,
  ) => Extract<BoardDrawing, { readonly kind: Kind }>;
} = {
  arrow: (base, { dx, dy }) => ({
    ...base,
    kind: "arrow",
    dx: finite(dx),
    dy: finite(dy),
  }),
  zone: (base, { width, height }) => ({
    ...base,
    kind: "zone",
    width: extent(width),
    height: extent(height),
  }),
  note: (base, { text }) => {
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > MAX_NOTE_LENGTH
    )
      throw new Error(
        `Each note needs text of at most ${MAX_NOTE_LENGTH} characters.`,
      );
    return { ...base, kind: "note", text };
  },
};

function isDrawingKind(value: unknown): value is BoardDrawing["kind"] {
  return typeof value === "string" && Object.hasOwn(DRAWING_DECODERS, value);
}

export function decodeDrawing(value: unknown): BoardDrawing {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid drawing.");
  const fields: DrawingFields = value;
  const { id, kind, color } = fields;
  if (!isDrawingKind(kind)) throw new Error("Unknown drawing kind.");
  if (typeof id !== "string" || !id || id.length > 100)
    throw new Error("Invalid drawing ID.");
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
    throw new Error("Invalid drawing color.");
  return DRAWING_DECODERS[kind](
    { id, color, x: finite(fields.x), y: finite(fields.y) },
    fields,
  );
}

export function createDrawing(
  kind: BoardDrawing["kind"],
  start: BoardPoint,
  end: BoardPoint,
  color: string,
): BoardDrawing {
  const base = { id: crypto.randomUUID(), color, ...start };
  switch (kind) {
    case "arrow":
      return { ...base, kind, dx: end.x - start.x, dy: end.y - start.y };
    case "zone":
      return {
        ...base,
        kind,
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
    case "note":
      return { ...base, kind, text: "New note" };
  }
}

export function moveDrawing(
  drawing: BoardDrawing,
  x: number,
  y: number,
  map: Pick<MapDefinition, "width" | "height">,
  measureNote: MeasureBoardNote,
): BoardDrawing {
  const left = drawing.kind === "arrow" ? Math.min(0, drawing.dx) : 0;
  const top = drawing.kind === "arrow" ? Math.min(0, drawing.dy) : 0;
  const size: BoardSize =
    drawing.kind === "note"
      ? measureNote(drawing.text)
      : drawing.kind === "zone"
        ? drawing
        : { width: Math.max(0, drawing.dx), height: Math.max(0, drawing.dy) };
  return {
    ...drawing,
    x: Math.round(Math.max(-left, Math.min(map.width - size.width, x))),
    y: Math.round(Math.max(-top, Math.min(map.height - size.height, y))),
  };
}

export function equalDrawings(
  left: readonly BoardDrawing[],
  right: readonly BoardDrawing[],
): boolean {
  return (
    left.length === right.length &&
    left.every((drawing, index) => {
      const other = right[index];
      if (
        !other ||
        drawing.id !== other.id ||
        drawing.kind !== other.kind ||
        drawing.x !== other.x ||
        drawing.y !== other.y ||
        drawing.color !== other.color
      )
        return false;
      switch (drawing.kind) {
        case "arrow":
          return (
            other.kind === "arrow" &&
            drawing.dx === other.dx &&
            drawing.dy === other.dy
          );
        case "zone":
          return (
            other.kind === "zone" &&
            drawing.width === other.width &&
            drawing.height === other.height
          );
        case "note":
          return other.kind === "note" && drawing.text === other.text;
      }
    })
  );
}
