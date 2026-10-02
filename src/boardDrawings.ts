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
  map: MapDefinition,
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
