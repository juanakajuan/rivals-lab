import Konva from "konva";
import {
  MIN_DRAWING_SPAN,
  createDrawing as createAnnotation,
  drawingHandles,
  moveDrawing,
  resizeDrawing,
  type BoardDrawing,
  type BoardPoint,
  type BoardTool,
  type DrawingHandle,
  type ResizeCursor,
} from "./boardDrawings";
import { createBoardNote, measureBoardNote } from "./boardNote";

import {
  HERO_BY_ID,
  HEROES,
  heroImagePath,
  type HeroDefinition,
  type HeroRole,
  type Team,
} from "./heroes";
import type { BoardMapDefinition } from "./boardMaps";
import { TOKEN_RADIUS, tokenBoundary, type BoardToken } from "./boardTokens";

export interface BoardSnapshot {
  readonly map: BoardMapDefinition;
  readonly tokens: readonly BoardToken[];
  readonly selectedTokenId: string | null;
  readonly iconSize: number;
  readonly drawings?: readonly BoardDrawing[];
  readonly tool?: BoardTool;
  readonly drawingColor?: string;
  readonly selectedDrawingId?: string | null;
}

export interface BoardEvents {
  readonly onDrawingSelect?: (drawing: BoardDrawing | null) => void;
  readonly onDrawingContextMenu?: (
    drawing: BoardDrawing,
    clientX: number,
    clientY: number,
  ) => void;
  readonly onDrawingEdit?: (drawing: BoardDrawing) => void;
  readonly onSelect: (token: BoardToken | null) => void;
  readonly onMove: (token: BoardToken, x: number, y: number) => void;
  readonly onContextMenu: (
    token: BoardToken,
    clientX: number,
    clientY: number,
  ) => void;
}

export interface BoardCanvas {
  readonly update: (snapshot: BoardSnapshot) => void;
  readonly toBoardPoint: (
    clientX: number,
    clientY: number,
  ) => { readonly x: number; readonly y: number };
  readonly destroy: () => void;
}

interface TokenDrawing {
  readonly group: Konva.Group;
  readonly ring: Konva.Circle;
  portrait: Konva.Image | Konva.Text;
  image: HTMLImageElement | undefined;
  token: BoardToken;
  dragging: boolean;
}

type BoardCursor = "default" | "grab" | "grabbing" | ResizeCursor;

const TEAM_COLORS: Readonly<Record<Team, string>> = {
  ally: "#50b9ff",
  enemy: "#ff6268",
};

const ROLE_COLORS: Readonly<Record<HeroRole, string>> = {
  Vanguard: "#c2a173",
  Duelist: "#a693d4",
  Strategist: "#73aa9c",
  "All Roles": "#d6d7dc",
};

function drawMap(
  layer: Konva.Layer,
  map: BoardMapDefinition,
  image: HTMLImageElement,
): void {
  layer.destroyChildren();
  layer.add(
    new Konva.Image({
      image,
      width: map.width,
      height: map.height,
      listening: false,
    }),
  );
  layer.draw();
}

function resizeStage(
  stage: Konva.Stage,
  host: HTMLDivElement,
  map: BoardMapDefinition,
): void {
  const { clientWidth: width, clientHeight: height } = host;
  if (width <= 0 || height <= 0) return;

  const scale = Math.min(width / map.width, height / map.height);
  stage.width(map.width * scale);
  stage.height(map.height * scale);
  stage.scale({ x: scale, y: scale });
  stage.batchDraw();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function boundTokenPosition(
  position: Konva.Vector2d,
  scale: number,
  map: BoardMapDefinition,
  iconSize: number,
): Konva.Vector2d {
  const boundary = tokenBoundary(iconSize);
  return {
    x: clamp(position.x, boundary * scale, (map.width - boundary) * scale),
    y: clamp(position.y, boundary * scale, (map.height - boundary) * scale),
  };
}

function setBoardCursor(stage: Konva.Stage, cursor: BoardCursor): void {
  stage.container().style.cursor = cursor;
}

function createTokenPortrait(
  hero: HeroDefinition,
  heroImage: HTMLImageElement | undefined,
): Konva.Image | Konva.Text {
  if (heroImage) {
    return new Konva.Image({
      x: -TOKEN_RADIUS + 3,
      y: -TOKEN_RADIUS + 3,
      width: (TOKEN_RADIUS - 3) * 2,
      height: (TOKEN_RADIUS - 3) * 2,
      image: heroImage,
      cornerRadius: TOKEN_RADIUS - 3,
    });
  }

  return new Konva.Text({
    x: -TOKEN_RADIUS + 3,
    y: -9,
    width: (TOKEN_RADIUS - 3) * 2,
    text: hero.initials,
    align: "center",
    fontFamily: "Arial, sans-serif",
    fontSize: 17,
    fontStyle: "bold",
    fill: ROLE_COLORS[hero.role],
  });
}

function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

/** Owns the canvas until destroy; updates preserve tokens during selection and image loading. */
export function createBoardCanvas(
  host: HTMLDivElement,
  events: BoardEvents,
): BoardCanvas {
  const stage = new Konva.Stage({ container: host, width: 1, height: 1 });
  const mapLayer = new Konva.Layer();
  const tokenLayer = new Konva.Layer();
  const annotationLayer = new Konva.Layer();
  stage.add(mapLayer, annotationLayer, tokenLayer);
  const handleGroup = new Konva.Group({ draggable: false });
  annotationLayer.add(handleGroup);
  const annotations = new Map<
    string,
    { group: Konva.Group; drawing: BoardDrawing; dragging: boolean }
  >();
  let gesture: { start: BoardPoint; preview: Konva.Group } | null = null;
  let activeResize: {
    readonly drawing: BoardDrawing;
    readonly handle: DrawingHandle;
    readonly pointerId: number;
    preview: BoardDrawing;
  } | null = null;
  const drawings = new Map<string, TokenDrawing>();
  const heroImages = new Map<string, HTMLImageElement>();
  let snapshot: BoardSnapshot | null = null;
  let pointerTool: BoardTool = "move";
  let destroyed = false;
  let mapRequest = 0;

  function createDrawing(
    token: BoardToken,
    hero: HeroDefinition,
  ): TokenDrawing {
    const group = new Konva.Group({
      id: token.id,
      x: token.x,
      y: token.y,
      draggable: true,
    });
    const image = heroImages.get(hero.id);
    const portrait = createTokenPortrait(hero, image);
    const ring = new Konva.Circle({ radius: TOKEN_RADIUS, strokeWidth: 3 });
    const drawing: TokenDrawing = {
      group,
      ring,
      portrait,
      image,
      token,
      dragging: false,
    };
    group.add(
      new Konva.Circle({ radius: TOKEN_RADIUS, fill: "#222326" }),
      portrait,
      ring,
    );
    group.dragBoundFunc((position) =>
      snapshot
        ? boundTokenPosition(
            position,
            stage.scaleX(),
            snapshot.map,
            snapshot.iconSize,
          )
        : position,
    );
    group.on("click tap", (event) => {
      event.cancelBubble = true;
      events.onSelect(drawing.token);
    });
    group.on("contextmenu", (event) => {
      event.evt.preventDefault();
      event.cancelBubble = true;
      events.onContextMenu(drawing.token, event.evt.clientX, event.evt.clientY);
    });
    group.on("pointerenter", () => setBoardCursor(stage, "grab"));
    group.on("pointerleave", () => setBoardCursor(stage, "default"));
    group.on("dragstart", () => {
      drawing.dragging = true;
      group.moveToTop();
      setBoardCursor(stage, "grabbing");
      events.onSelect(drawing.token);
    });
    group.on("dragend", () => {
      drawing.dragging = false;
      setBoardCursor(stage, "grab");
      events.onMove(
        drawing.token,
        Math.round(group.x()),
        Math.round(group.y()),
      );
    });
    tokenLayer.add(group);
    return drawing;
  }

  function renderTokens(current: BoardSnapshot): void {
    const present = new Set(
      current.tokens
        .filter((token) => HERO_BY_ID.has(token.heroId))
        .map((token) => token.id),
    );
    for (const [id, drawing] of drawings) {
      if (present.has(id)) continue;
      drawing.group.off();
      drawing.group.destroy();
      drawings.delete(id);
    }
    for (const token of current.tokens) {
      const hero = HERO_BY_ID.get(token.heroId);
      if (!hero) continue;
      let drawing = drawings.get(token.id);
      if (drawing && drawing.token.heroId !== token.heroId) {
        drawing.group.off();
        drawing.group.destroy();
        drawings.delete(token.id);
        drawing = undefined;
      }
      if (!drawing) {
        drawing = createDrawing(token, hero);
        drawings.set(token.id, drawing);
      }

      drawing.group.scale({
        x: current.iconSize / 100,
        y: current.iconSize / 100,
      });
      drawing.token = token;
      if (!drawing.dragging) drawing.group.position({ x: token.x, y: token.y });
      const image = heroImages.get(hero.id);
      if (image !== drawing.image) {
        drawing.portrait.destroy();
        drawing.portrait = createTokenPortrait(hero, image);
        drawing.image = image;
        drawing.group.add(drawing.portrait);
        drawing.ring.moveToTop();
      }
      const selected = token.id === current.selectedTokenId;
      drawing.ring.stroke(selected ? "#ffffff" : TEAM_COLORS[token.team]);
      drawing.ring.strokeWidth(selected ? 4 : 3);
    }
    tokenLayer.batchDraw();
  }

  function annotationShape(
    drawing: BoardDrawing,
    selected: boolean,
  ): Konva.Shape {
    const common = {
      stroke: drawing.color,
      strokeWidth: selected ? 5 : 3,
      hitStrokeWidth: 18,
    };
    switch (drawing.kind) {
      case "arrow":
        return new Konva.Arrow({
          ...common,
          points: [0, 0, drawing.dx, drawing.dy],
          fill: drawing.color,
          pointerLength: 16,
          pointerWidth: 14,
        });
      case "zone":
        return new Konva.Rect({
          ...common,
          width: drawing.width,
          height: drawing.height,
          fill: drawing.color + "33",
          dash: selected ? [10, 5] : [],
        });
      case "note": {
        const note = createBoardNote(drawing.text, drawing.width);
        note.setAttrs({
          fill: drawing.color,
          shadowColor: "#000000",
          shadowBlur: 4,
          ...(selected ? { stroke: "#ffffff" } : {}),
          strokeWidth: selected ? 0.4 : 0,
        });
        return note;
      }
    }
  }

  function cancelGesture(): void {
    gesture?.preview.destroy();
    gesture = null;
    annotationLayer.batchDraw();
  }

  function toolCursor(current: BoardSnapshot): BoardCursor {
    return current.tool && current.tool !== "move" ? "crosshair" : "default";
  }

  function shownDrawing(drawing: BoardDrawing): BoardDrawing {
    if (activeResize?.drawing.id === drawing.id) return activeResize.preview;
    return drawing;
  }

  function pointerFromClient(
    clientX: number,
    clientY: number,
  ): BoardPoint | null {
    if (!snapshot) return null;
    const scaleX = stage.scaleX();
    const scaleY = stage.scaleY();
    if (scaleX === 0 || scaleY === 0) return null;
    const bounds = stage.getContent().getBoundingClientRect();
    return {
      x: Math.round(
        clamp((clientX - bounds.left) / scaleX, 0, snapshot.map.width),
      ),
      y: Math.round(
        clamp((clientY - bounds.top) / scaleY, 0, snapshot.map.height),
      ),
    };
  }

  function clearResize(): void {
    if (!activeResize) return;
    const id = activeResize.drawing.id;
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeUp);
    window.removeEventListener("pointercancel", onResizeCancel);
    activeResize = null;
    const entry = annotations.get(id);
    if (entry) entry.group.draggable(true);
    if (snapshot) setBoardCursor(stage, toolCursor(snapshot));
  }

  function cancelResize(): void {
    if (!activeResize) return;
    clearResize();
    if (!destroyed && snapshot) renderAnnotations(snapshot);
  }

  function beginResize(
    drawing: BoardDrawing,
    handle: DrawingHandle,
    event: PointerEvent,
  ): void {
    if (event.button > 0 || activeResize) return;
    activeResize = {
      drawing,
      handle,
      pointerId: event.pointerId,
      preview: drawing,
    };
    const entry = annotations.get(drawing.id);
    if (entry) entry.group.draggable(false);
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp);
    window.addEventListener("pointercancel", onResizeCancel);
    setBoardCursor(stage, handle.cursor);
  }

  function onResizeMove(event: PointerEvent): void {
    if (
      !activeResize ||
      !snapshot ||
      event.pointerId !== activeResize.pointerId
    )
      return;
    const point = pointerFromClient(event.clientX, event.clientY);
    if (!point) return;
    activeResize = {
      ...activeResize,
      preview: resizeDrawing(
        activeResize.drawing,
        activeResize.handle,
        point,
        snapshot.map,
        measureBoardNote,
      ),
    };
    renderAnnotations(snapshot);
  }

  function finishResize(event: PointerEvent): void {
    if (!activeResize || event.pointerId !== activeResize.pointerId) return;
    const gestureAtDown = activeResize;
    const current = snapshot;
    if (!current) {
      clearResize();
      return;
    }
    const stillThere = (current.drawings ?? []).some(
      (item) => item.id === gestureAtDown.drawing.id,
    );
    if (!stillThere) {
      clearResize();
      renderAnnotations(current);
      return;
    }
    const point = pointerFromClient(event.clientX, event.clientY);
    if (!point) {
      clearResize();
      renderAnnotations(current);
      return;
    }
    const next = resizeDrawing(
      gestureAtDown.drawing,
      gestureAtDown.handle,
      point,
      current.map,
      measureBoardNote,
    );
    activeResize = { ...gestureAtDown, preview: next };
    renderAnnotations(current);
    clearResize();
    events.onDrawingEdit?.(next);
  }

  function onResizeUp(event: PointerEvent): void {
    finishResize(event);
  }

  function onResizeCancel(event: PointerEvent): void {
    if (!activeResize || event.pointerId !== activeResize.pointerId) return;
    cancelResize();
  }

  function syncHandles(current: BoardSnapshot): void {
    handleGroup.destroyChildren();
    const selectedId = activeResize?.drawing.id ?? current.selectedDrawingId;
    const committed = (current.drawings ?? []).find(
      (item) => item.id === selectedId,
    );
    if (!committed) {
      handleGroup.moveToTop();
      return;
    }
    const shown = shownDrawing(committed);
    const entry = annotations.get(committed.id);
    const offsetX = entry?.dragging ? entry.group.x() - shown.x : 0;
    const offsetY = entry?.dragging ? entry.group.y() - shown.y : 0;
    const scale = stage.scaleX();
    const size = scale === 0 ? 12 : 12 / scale;
    const strokeWidth = scale === 0 ? 1 : 1 / scale;
    const hitStrokeWidth = scale === 0 ? 8 : 8 / scale;
    for (const handle of drawingHandles(shown, measureBoardNote)) {
      const square = new Konva.Rect({
        x: handle.at.x + offsetX - size / 2,
        y: handle.at.y + offsetY - size / 2,
        width: size,
        height: size,
        fill: "#ffffff",
        stroke: "#1b1c1f",
        strokeWidth,
        hitStrokeWidth,
        draggable: false,
      });
      square.on("mousedown touchstart", (konvaEvent) => {
        konvaEvent.cancelBubble = true;
      });
      square.on("pointerdown", (konvaEvent) => {
        konvaEvent.cancelBubble = true;
        if (!(konvaEvent.evt instanceof PointerEvent)) return;
        beginResize(committed, handle, konvaEvent.evt);
      });
      square.on("pointerenter", () => {
        setBoardCursor(stage, handle.cursor);
      });
      square.on("pointerleave", () => {
        if (activeResize) return;
        setBoardCursor(stage, toolCursor(current));
      });
      handleGroup.add(square);
    }
    handleGroup.moveToTop();
  }

  function renderAnnotations(current: BoardSnapshot): void {
    const items = current.drawings ?? [];
    for (const [id, item] of annotations) {
      if (items.some((drawing) => drawing.id === id)) continue;
      item.group.destroy();
      annotations.delete(id);
    }
    for (const drawing of items) {
      let item = annotations.get(drawing.id);
      if (!item) {
        const group = new Konva.Group({ id: drawing.id });
        item = { group, drawing, dragging: false };
        annotations.set(drawing.id, item);
        const entry = item;
        group.on("click tap", (event) => {
          event.cancelBubble = true;
          if (event.evt instanceof MouseEvent && event.evt.button !== 0) return;
          events.onDrawingSelect?.(entry.drawing);
        });
        group.on("contextmenu", (event) => {
          event.evt.preventDefault();
          event.cancelBubble = true;
          events.onDrawingContextMenu?.(
            entry.drawing,
            event.evt.clientX,
            event.evt.clientY,
          );
        });
        group.on("dragstart", () => {
          entry.dragging = true;
          events.onDrawingSelect?.(entry.drawing);
        });
        group.on("dragmove", () => {
          if (snapshot) syncHandles(snapshot);
        });
        group.on("dragend", () => {
          entry.dragging = false;
          if (activeResize || !snapshot) return;
          events.onDrawingEdit?.(
            moveDrawing(
              entry.drawing,
              group.x(),
              group.y(),
              snapshot.map,
              measureBoardNote,
            ),
          );
        });
        group.dragBoundFunc((point) => {
          if (!snapshot) return point;
          const moved = moveDrawing(
            entry.drawing,
            point.x / stage.scaleX(),
            point.y / stage.scaleY(),
            snapshot.map,
            measureBoardNote,
          );
          return { x: moved.x * stage.scaleX(), y: moved.y * stage.scaleY() };
        });
        annotationLayer.add(group);
      }
      const painted = shownDrawing(drawing);
      item.drawing = drawing;
      item.group.draggable(activeResize?.drawing.id !== drawing.id);
      if (!item.dragging) item.group.position({ x: painted.x, y: painted.y });
      item.group.destroyChildren();
      item.group.add(
        annotationShape(painted, drawing.id === current.selectedDrawingId),
      );
    }
    syncHandles(current);
    annotationLayer.batchDraw();
  }

  function pointerPoint(): BoardPoint | null {
    const point = stage.getPointerPosition();
    if (!point || !snapshot) return null;
    return {
      x: Math.round(clamp(point.x / stage.scaleX(), 0, snapshot.map.width)),
      y: Math.round(clamp(point.y / stage.scaleY(), 0, snapshot.map.height)),
    };
  }
  stage.on("pointerdown", (event) => {
    pointerTool = snapshot?.tool ?? "move";
    const tool = snapshot?.tool;
    if (
      !tool ||
      tool === "move" ||
      event.evt.button > 0 ||
      event.target !== stage
    )
      return;
    const start = pointerPoint();
    if (!start) return;
    cancelGesture();
    const preview = new Konva.Group({
      x: start.x,
      y: start.y,
      listening: false,
    });
    annotationLayer.add(preview);
    gesture = { start, preview };
  });
  stage.on("pointermove", () => {
    const end = pointerPoint();
    const tool = snapshot?.tool;
    if (!snapshot || !gesture || !end || !tool || tool === "move") return;
    const drawing = createAnnotation(
      tool,
      gesture.start,
      end,
      snapshot?.drawingColor ?? "#ffd166",
    );
    gesture.preview.position({ x: drawing.x, y: drawing.y });
    gesture.preview.destroyChildren();
    gesture.preview.add(annotationShape(drawing, false));
    annotationLayer.batchDraw();
  });
  stage.on("pointerup", () => {
    const end = pointerPoint();
    const tool = snapshot?.tool;
    if (!snapshot || !gesture || !end || !tool || tool === "move") return;
    const drawing = createAnnotation(
      tool,
      gesture.start,
      end,
      snapshot?.drawingColor ?? "#ffd166",
    );
    cancelGesture();
    if (
      drawing.kind === "arrow" &&
      Math.hypot(drawing.dx, drawing.dy) < MIN_DRAWING_SPAN
    )
      return;
    if (
      drawing.kind === "zone" &&
      (drawing.width < MIN_DRAWING_SPAN || drawing.height < MIN_DRAWING_SPAN)
    )
      return;
    events.onDrawingEdit?.(
      moveDrawing(
        drawing,
        drawing.x,
        drawing.y,
        snapshot.map,
        measureBoardNote,
      ),
    );
  });
  stage.on("pointerleave", cancelGesture);
  stage.on("pointercancel", () => {
    cancelGesture();
    cancelResize();
  });
  function cancelOnEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    cancelGesture();
    cancelResize();
  }
  window.addEventListener("keydown", cancelOnEscape);
  stage.on("click tap", (event) => {
    if (event.evt instanceof MouseEvent && event.evt.button !== 0) return;
    if (event.target !== stage) return;
    if (pointerTool === "move") {
      events.onSelect(null);
      events.onDrawingSelect?.(null);
    }
  });
  const resizeObserver = new ResizeObserver(() => {
    if (!destroyed && snapshot) resizeStage(stage, host, snapshot.map);
  });
  resizeObserver.observe(host);

  void Promise.all(
    HEROES.map(async (hero) => {
      const image = await loadImage(heroImagePath(hero.id));
      return { heroId: hero.id, image };
    }),
  ).then((images) => {
    if (destroyed) return;
    for (const { heroId, image } of images) {
      if (image) heroImages.set(heroId, image);
    }
    if (snapshot) renderTokens(snapshot);
  });

  return {
    update(current) {
      if (destroyed) return;
      const mapChanged = snapshot?.map !== current.map;
      // Committed edits (including history restore) cancel an unfinished gesture.
      // Selection and image updates keep the same token array and preserve it.
      if (
        snapshot?.tokens !== current.tokens ||
        snapshot?.iconSize !== current.iconSize
      ) {
        for (const [id, drawing] of drawings) {
          if (!drawing.dragging) continue;
          drawing.group.off();
          drawing.group.destroy();
          drawings.delete(id);
          setBoardCursor(stage, "default");
        }
      }
      if (
        snapshot?.map !== current.map ||
        snapshot?.tokens !== current.tokens ||
        snapshot?.drawings !== current.drawings ||
        snapshot?.tool !== current.tool ||
        snapshot?.drawingColor !== current.drawingColor
      ) {
        cancelGesture();
        clearResize();
        for (const [id, item] of annotations) {
          if (!item.dragging) continue;
          item.group.destroy();
          annotations.delete(id);
        }
      }
      snapshot = current;
      setBoardCursor(
        stage,
        activeResize ? activeResize.handle.cursor : toolCursor(current),
      );
      if (mapChanged) {
        // A map change ends the old gesture, as stage replacement did before.
        for (const drawing of drawings.values()) {
          drawing.group.off();
          drawing.group.destroy();
        }
        drawings.clear();
        setBoardCursor(stage, "default");
        mapLayer.destroyChildren();
        mapLayer.batchDraw();
        resizeStage(stage, host, current.map);
        const request = ++mapRequest;
        void loadImage(current.map.imagePath).then((image) => {
          if (destroyed || request !== mapRequest || !image) return;
          drawMap(mapLayer, current.map, image);
        });
      }
      renderTokens(current);
      renderAnnotations(current);
    },
    toBoardPoint(clientX, clientY) {
      // The canvas is centered inside the host, which can have unused space.
      const bounds = stage.getContent().getBoundingClientRect();
      return {
        x: (clientX - bounds.left) / stage.scaleX(),
        y: (clientY - bounds.top) / stage.scaleY(),
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      window.removeEventListener("keydown", cancelOnEscape);
      cancelResize();
      cancelGesture();
      for (const drawing of drawings.values()) drawing.group.off();
      stage.destroy();
      drawings.clear();
      host.style.cursor = "";
    },
  };
}
