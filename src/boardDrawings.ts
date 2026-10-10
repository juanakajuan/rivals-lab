import type { MapDefinition } from "./maps";

interface DrawingBase {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

export type ArrowDrawing = DrawingBase & {
  readonly kind: "arrow";
  readonly dx: number;
  readonly dy: number;
};

export type ZoneDrawing = DrawingBase & {
  readonly kind: "zone";
  readonly width: number;
  readonly height: number;
};

export type NoteDrawing = DrawingBase & {
  readonly kind: "note";
  readonly text: string;
  readonly width: number;
};

export type BoardDrawing = ArrowDrawing | ZoneDrawing | NoteDrawing;
export type BoardTool = "move" | BoardDrawing["kind"];
export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}
export interface BoardSize {
  readonly width: number;
  readonly height: number;
}

export type MeasureBoardNote = (text: string, width: number) => BoardSize;

export const MAX_NOTE_LENGTH = 200;
export const MAX_DRAWINGS_PER_MAP = 2_000;
export const NOTE_WIDTH = 180;
export const NOTE_FONT_SIZE = 20;
export const NOTE_PADDING = 8;
export const NOTE_LINE_HEIGHT = 1;
export const MIN_DRAWING_SPAN = 8;

export function drawingLimitMessage(): string {
  return `A map can hold at most ${MAX_DRAWINGS_PER_MAP.toLocaleString("en")} drawings.`;
}

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
  note: (base, { text, width }) => {
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > MAX_NOTE_LENGTH
    )
      throw new Error(
        `Each note needs text of at most ${MAX_NOTE_LENGTH} characters.`,
      );
    return {
      ...base,
      kind: "note",
      text,
      width: width === undefined ? NOTE_WIDTH : extent(width),
    };
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
      return { ...base, kind, text: "New note", width: NOTE_WIDTH };
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
      ? measureNote(drawing.text, drawing.width)
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
          return (
            other.kind === "note" &&
            drawing.text === other.text &&
            drawing.width === other.width
          );
      }
    })
  );
}

export type ResizeCursor =
  "ew-resize" | "ns-resize" | "nesw-resize" | "nwse-resize" | "crosshair";

type EdgeMove = "min" | "max" | "fixed";

const ARROW_HANDLE_TABLE = {
  tail: { cursor: "crosshair" },
  tip: { cursor: "crosshair" },
} as const satisfies Record<string, { readonly cursor: ResizeCursor }>;
type ArrowHandleId = keyof typeof ARROW_HANDLE_TABLE;

const ZONE_HANDLE_TABLE = {
  n: { cursor: "ns-resize", x: "fixed", y: "min" },
  e: { cursor: "ew-resize", x: "max", y: "fixed" },
  s: { cursor: "ns-resize", x: "fixed", y: "max" },
  w: { cursor: "ew-resize", x: "min", y: "fixed" },
  ne: { cursor: "nesw-resize", x: "max", y: "min" },
  se: { cursor: "nwse-resize", x: "max", y: "max" },
  sw: { cursor: "nesw-resize", x: "min", y: "max" },
  nw: { cursor: "nwse-resize", x: "min", y: "min" },
} as const satisfies Record<
  string,
  { readonly cursor: ResizeCursor; readonly x: EdgeMove; readonly y: EdgeMove }
>;
type ZoneHandleId = keyof typeof ZONE_HANDLE_TABLE;

const NOTE_HANDLE_TABLE = {
  w: { cursor: "ew-resize", x: "min" },
  e: { cursor: "ew-resize", x: "max" },
} as const satisfies Record<
  string,
  { readonly cursor: ResizeCursor; readonly x: "min" | "max" }
>;
type NoteHandleId = keyof typeof NOTE_HANDLE_TABLE;

export type DrawingHandle =
  | {
      readonly kind: "arrow";
      readonly id: ArrowHandleId;
      readonly at: BoardPoint;
      readonly cursor: ResizeCursor;
    }
  | {
      readonly kind: "zone";
      readonly id: ZoneHandleId;
      readonly at: BoardPoint;
      readonly cursor: ResizeCursor;
    }
  | {
      readonly kind: "note";
      readonly id: NoteHandleId;
      readonly at: BoardPoint;
      readonly cursor: ResizeCursor;
    };

type MapSize = Pick<MapDefinition, "width" | "height">;

export function drawingHandles(
  drawing: BoardDrawing,
  measureNote: MeasureBoardNote,
): readonly DrawingHandle[] {
  switch (drawing.kind) {
    case "arrow":
      return arrowHandles(drawing);
    case "zone":
      return zoneHandles(drawing);
    case "note":
      return noteHandles(drawing, measureNote);
  }
}

export function resizeDrawing(
  drawing: BoardDrawing,
  handle: DrawingHandle,
  pointer: BoardPoint,
  map: MapSize,
  measureNote: MeasureBoardNote,
): BoardDrawing {
  switch (drawing.kind) {
    case "arrow":
      return handle.kind === "arrow"
        ? resizeArrow(drawing, handle.id, pointer, map)
        : drawing;
    case "zone":
      return handle.kind === "zone"
        ? resizeZone(drawing, handle.id, pointer, map)
        : drawing;
    case "note":
      return handle.kind === "note"
        ? resizeNote(drawing, handle.id, pointer, map, measureNote)
        : drawing;
  }
}

function arrowHandles(arrow: ArrowDrawing): readonly DrawingHandle[] {
  const tail = { x: arrow.x, y: arrow.y };
  const tip = { x: arrow.x + arrow.dx, y: arrow.y + arrow.dy };
  return [
    {
      kind: "arrow",
      id: "tail",
      at: tail,
      cursor: ARROW_HANDLE_TABLE.tail.cursor,
    },
    {
      kind: "arrow",
      id: "tip",
      at: tip,
      cursor: ARROW_HANDLE_TABLE.tip.cursor,
    },
  ];
}

function zoneHandles(zone: ZoneDrawing): readonly DrawingHandle[] {
  const left = zone.x;
  const right = zone.x + zone.width;
  const top = zone.y;
  const bottom = zone.y + zone.height;
  const midX = left + zone.width / 2;
  const midY = top + zone.height / 2;
  const at = {
    n: { x: midX, y: top },
    e: { x: right, y: midY },
    s: { x: midX, y: bottom },
    w: { x: left, y: midY },
    ne: { x: right, y: top },
    se: { x: right, y: bottom },
    sw: { x: left, y: bottom },
    nw: { x: left, y: top },
  } satisfies { readonly [Id in ZoneHandleId]: BoardPoint };
  return [
    zoneHandle("n", at.n),
    zoneHandle("e", at.e),
    zoneHandle("s", at.s),
    zoneHandle("w", at.w),
    zoneHandle("ne", at.ne),
    zoneHandle("se", at.se),
    zoneHandle("sw", at.sw),
    zoneHandle("nw", at.nw),
  ];
}

function zoneHandle(id: ZoneHandleId, at: BoardPoint): DrawingHandle {
  return { kind: "zone", id, at, cursor: ZONE_HANDLE_TABLE[id].cursor };
}

function noteHandles(
  note: NoteDrawing,
  measureNote: MeasureBoardNote,
): readonly DrawingHandle[] {
  const midY = note.y + measureNote(note.text, note.width).height / 2;
  const at = {
    w: { x: note.x, y: midY },
    e: { x: note.x + note.width, y: midY },
  } satisfies { readonly [Id in NoteHandleId]: BoardPoint };
  return [
    { kind: "note", id: "w", at: at.w, cursor: NOTE_HANDLE_TABLE.w.cursor },
    { kind: "note", id: "e", at: at.e, cursor: NOTE_HANDLE_TABLE.e.cursor },
  ];
}

function moveEdge(
  fixed: number,
  proposed: number,
  side: "min" | "max",
  minSpan: number,
  limit0: number,
  limit1: number,
): { readonly min: number; readonly max: number } {
  const placed = placeEdge(fixed, proposed, side, minSpan, limit0, limit1);
  const roundedFixed =
    side === "max" ? Math.round(placed.min) : Math.round(placed.max);
  const roundedProposed =
    side === "max" ? Math.round(placed.max) : Math.round(placed.min);
  return placeEdge(
    roundedFixed,
    roundedProposed,
    side,
    minSpan,
    limit0,
    limit1,
  );
}

function placeEdge(
  fixed: number,
  proposed: number,
  side: "min" | "max",
  minSpan: number,
  limit0: number,
  limit1: number,
): { readonly min: number; readonly max: number } {
  if (limit1 - limit0 < minSpan) return { min: limit0, max: limit1 };
  if (side === "max") {
    let minEdge = Math.min(Math.max(fixed, limit0), limit1);
    let maxEdge = proposed;
    if (maxEdge < minEdge + minSpan) maxEdge = minEdge + minSpan;
    if (maxEdge > limit1) maxEdge = limit1;
    if (maxEdge - minEdge < minSpan)
      minEdge = Math.max(limit0, maxEdge - minSpan);
    return { min: minEdge, max: maxEdge };
  }
  let maxEdge = Math.min(Math.max(fixed, limit0), limit1);
  let minEdge = proposed;
  if (minEdge > maxEdge - minSpan) minEdge = maxEdge - minSpan;
  if (minEdge < limit0) minEdge = limit0;
  if (maxEdge - minEdge < minSpan)
    maxEdge = Math.min(limit1, minEdge + minSpan);
  return { min: minEdge, max: maxEdge };
}

function resizeAxis(
  min: number,
  max: number,
  move: EdgeMove,
  pointer: number,
  limit: number,
): { readonly min: number; readonly max: number } {
  if (move === "fixed") {
    const stored = Math.max(0, max - min);
    return moveEdge(
      min,
      max,
      "max",
      Math.max(MIN_DRAWING_SPAN, stored),
      0,
      limit,
    );
  }
  return moveEdge(
    move === "max" ? min : max,
    pointer,
    move,
    MIN_DRAWING_SPAN,
    0,
    limit,
  );
}

function resizeZone(
  zone: ZoneDrawing,
  handle: ZoneHandleId,
  pointer: BoardPoint,
  map: MapSize,
): ZoneDrawing {
  const row = ZONE_HANDLE_TABLE[handle];
  const horizontal = resizeAxis(
    zone.x,
    zone.x + zone.width,
    row.x,
    pointer.x,
    map.width,
  );
  const vertical = resizeAxis(
    zone.y,
    zone.y + zone.height,
    row.y,
    pointer.y,
    map.height,
  );
  const next: ZoneDrawing = {
    ...zone,
    x: horizontal.min,
    y: vertical.min,
    width: horizontal.max - horizontal.min,
    height: vertical.max - vertical.min,
  };
  if (
    next.x === zone.x &&
    next.y === zone.y &&
    next.width === zone.width &&
    next.height === zone.height
  )
    return zone;
  return next;
}

function clampToMap(point: BoardPoint, map: MapSize): BoardPoint {
  return {
    x: Math.min(map.width, Math.max(0, point.x)),
    y: Math.min(map.height, Math.max(0, point.y)),
  };
}

function clampInteger(point: BoardPoint, map: MapSize): BoardPoint {
  return {
    x: Math.min(Math.max(Math.round(point.x), 0), Math.floor(map.width)),
    y: Math.min(Math.max(Math.round(point.y), 0), Math.floor(map.height)),
  };
}

function contains(point: BoardPoint, map: MapSize): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= map.width &&
    point.y <= map.height
  );
}

function arrowFits(map: MapSize): boolean {
  return Math.hypot(map.width, map.height) >= MIN_DRAWING_SPAN;
}

function travel(
  origin: BoardPoint,
  direction: BoardPoint,
  distance: number,
): BoardPoint {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) return origin;
  return {
    x: origin.x + (direction.x / length) * distance,
    y: origin.y + (direction.y / length) * distance,
  };
}

function pushDirection(
  arrow: ArrowDrawing,
  handle: ArrowHandleId,
  anchor: BoardPoint,
  pointer: BoardPoint,
): BoardPoint {
  const fromPointer = { x: pointer.x - anchor.x, y: pointer.y - anchor.y };
  if (fromPointer.x !== 0 || fromPointer.y !== 0) return fromPointer;
  const stored =
    handle === "tip"
      ? { x: arrow.dx, y: arrow.dy }
      : { x: -arrow.dx, y: -arrow.dy };
  if (stored.x !== 0 || stored.y !== 0) return stored;
  return { x: 1, y: 0 };
}

function separateArrow(
  anchor: BoardPoint,
  free: BoardPoint,
  map: MapSize,
): { readonly anchor: BoardPoint; readonly free: BoardPoint } {
  const maxX = Math.floor(map.width);
  const maxY = Math.floor(map.height);
  let nextAnchor = anchor;
  let nextFree = free;
  const inside = (point: BoardPoint): boolean =>
    point.x >= 0 && point.y >= 0 && point.x <= maxX && point.y <= maxY;
  const limit = maxX + maxY + MIN_DRAWING_SPAN + 2;
  for (let step = 0; step < limit; step += 1) {
    const dx = nextFree.x - nextAnchor.x;
    const dy = nextFree.y - nextAnchor.y;
    if (Math.hypot(dx, dy) >= MIN_DRAWING_SPAN) break;
    if (dx === 0 && dy === 0) {
      if (inside({ x: nextFree.x + 1, y: nextFree.y }))
        nextFree = { x: nextFree.x + 1, y: nextFree.y };
      else if (inside({ x: nextAnchor.x - 1, y: nextAnchor.y }))
        nextAnchor = { x: nextAnchor.x - 1, y: nextAnchor.y };
      else if (inside({ x: nextFree.x, y: nextFree.y + 1 }))
        nextFree = { x: nextFree.x, y: nextFree.y + 1 };
      else if (inside({ x: nextAnchor.x, y: nextAnchor.y - 1 }))
        nextAnchor = { x: nextAnchor.x, y: nextAnchor.y - 1 };
      else break;
      continue;
    }
    const stepX = Math.abs(dx) >= Math.abs(dy);
    const sign = stepX ? Math.sign(dx) : Math.sign(dy);
    const movedFree = stepX
      ? { x: nextFree.x + sign, y: nextFree.y }
      : { x: nextFree.x, y: nextFree.y + sign };
    if (inside(movedFree)) {
      nextFree = movedFree;
      continue;
    }
    const movedAnchor = stepX
      ? { x: nextAnchor.x - sign, y: nextAnchor.y }
      : { x: nextAnchor.x, y: nextAnchor.y - sign };
    if (inside(movedAnchor)) {
      nextAnchor = movedAnchor;
      continue;
    }
    break;
  }
  return { anchor: nextAnchor, free: nextFree };
}

function resizeArrow(
  arrow: ArrowDrawing,
  handle: ArrowHandleId,
  pointer: BoardPoint,
  map: MapSize,
): ArrowDrawing {
  const tail = { x: arrow.x, y: arrow.y };
  const tip = { x: arrow.x + arrow.dx, y: arrow.y + arrow.dy };
  const anchor = clampToMap(handle === "tip" ? tail : tip, map);
  let free = clampToMap(pointer, map);
  if (
    arrowFits(map) &&
    Math.hypot(free.x - anchor.x, free.y - anchor.y) < MIN_DRAWING_SPAN
  ) {
    let pushed = travel(
      anchor,
      pushDirection(arrow, handle, anchor, pointer),
      MIN_DRAWING_SPAN,
    );
    if (!contains(pushed, map)) {
      const center = { x: map.width / 2, y: map.height / 2 };
      const toward = { x: center.x - anchor.x, y: center.y - anchor.y };
      pushed = travel(
        anchor,
        toward.x === 0 && toward.y === 0 ? { x: 1, y: 0 } : toward,
        MIN_DRAWING_SPAN,
      );
    }
    free = clampToMap(pushed, map);
  }
  let roundedAnchor = clampInteger(anchor, map);
  let roundedFree = clampInteger(free, map);
  if (arrowFits(map)) {
    const separated = separateArrow(roundedAnchor, roundedFree, map);
    roundedAnchor = separated.anchor;
    roundedFree = separated.free;
  }
  const nextTail = handle === "tip" ? roundedAnchor : roundedFree;
  const nextTip = handle === "tip" ? roundedFree : roundedAnchor;
  const next: ArrowDrawing = {
    ...arrow,
    x: nextTail.x,
    y: nextTail.y,
    dx: nextTip.x - nextTail.x,
    dy: nextTip.y - nextTail.y,
  };
  if (
    next.x === arrow.x &&
    next.y === arrow.y &&
    next.dx === arrow.dx &&
    next.dy === arrow.dy
  )
    return arrow;
  return next;
}

function noteWidthThatFits(
  text: string,
  proposal: number,
  map: MapSize,
  measureNote: MeasureBoardNote,
): number | null {
  const fits = (width: number): boolean =>
    measureNote(text, width).height <= map.height;
  if (fits(proposal)) return proposal;
  let low = Math.floor(proposal) + 1;
  let high = Math.floor(map.width);
  if (low > high || !fits(high)) return null;
  let best = high;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid)) {
      best = mid;
      high = mid - 1;
    } else low = mid + 1;
  }
  return best;
}

function resizeNote(
  note: NoteDrawing,
  handle: NoteHandleId,
  pointer: BoardPoint,
  map: MapSize,
  measureNote: MeasureBoardNote,
): NoteDrawing {
  const floor = NOTE_PADDING * 2 + NOTE_FONT_SIZE;
  const right = note.x + note.width;
  const edges =
    handle === "e"
      ? moveEdge(note.x, pointer.x, "max", floor, 0, map.width)
      : moveEdge(right, pointer.x, "min", floor, 0, map.width);
  const width = noteWidthThatFits(
    note.text,
    edges.max - edges.min,
    map,
    measureNote,
  );
  if (width === null) return note;
  const x = handle === "e" ? edges.min : edges.max - width;
  const placed = moveDrawing(
    { ...note, x, width },
    x,
    note.y,
    map,
    measureNote,
  );
  if (placed.kind !== "note") return note;
  if (
    placed.x === note.x &&
    placed.y === note.y &&
    placed.width === note.width &&
    placed.text === note.text
  )
    return note;
  return placed;
}
