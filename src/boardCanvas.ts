import Konva from 'konva';

import {
  HERO_BY_ID,
  HEROES,
  heroImagePath,
  type HeroDefinition,
  type HeroRole,
  type Team
} from './heroes';
import type { MapDefinition } from './maps';

export interface BoardToken {
  readonly id: string;
  readonly heroId: string;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
}

export interface BoardSnapshot {
  readonly map: MapDefinition;
  readonly tokens: readonly BoardToken[];
  readonly selectedTokenId: string | null;
}

export interface BoardEvents {
  readonly onSelect: (token: BoardToken | null) => void;
  readonly onMove: (token: BoardToken, x: number, y: number) => void;
  readonly onContextMenu: (token: BoardToken, clientX: number, clientY: number) => void;
}

export interface BoardCanvas {
  readonly update: (snapshot: BoardSnapshot) => void;
  readonly toBoardPoint: (
    clientX: number,
    clientY: number
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

type BoardCursor = 'default' | 'grab' | 'grabbing';

const TOKEN_RADIUS = 26;

const TEAM_COLORS: Readonly<Record<Team, string>> = {
  ally: '#50b9ff',
  enemy: '#ff6268'
};

const ROLE_COLORS: Readonly<Record<HeroRole, string>> = {
  Vanguard: '#c2a173',
  Duelist: '#a693d4',
  Strategist: '#73aa9c',
  'All Roles': '#d6d7dc'
};

function drawMap(
  layer: Konva.Layer,
  map: MapDefinition,
  image: HTMLImageElement
): void {
  layer.destroyChildren();
  layer.add(new Konva.Image({
    image,
    width: map.width,
    height: map.height,
    listening: false
  }));
  layer.draw();
}

function resizeStage(
  stage: Konva.Stage,
  host: HTMLDivElement,
  map: MapDefinition
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

export function clampToBoard(value: number, maximum: number): number {
  return Math.round(clamp(value, TOKEN_RADIUS, maximum - TOKEN_RADIUS));
}

function boundTokenPosition(
  position: Konva.Vector2d,
  scale: number,
  map: MapDefinition
): Konva.Vector2d {
  return {
    x: clamp(position.x, TOKEN_RADIUS * scale, (map.width - TOKEN_RADIUS) * scale),
    y: clamp(position.y, TOKEN_RADIUS * scale, (map.height - TOKEN_RADIUS) * scale)
  };
}

function setBoardCursor(stage: Konva.Stage, cursor: BoardCursor): void {
  stage.container().style.cursor = cursor;
}

function createTokenPortrait(
  hero: HeroDefinition,
  heroImage: HTMLImageElement | undefined
): Konva.Image | Konva.Text {
  if (heroImage) {
    return new Konva.Image({
      x: -TOKEN_RADIUS + 3,
      y: -TOKEN_RADIUS + 3,
      width: (TOKEN_RADIUS - 3) * 2,
      height: (TOKEN_RADIUS - 3) * 2,
      image: heroImage,
      cornerRadius: TOKEN_RADIUS - 3
    });
  }

  return new Konva.Text({
    x: -TOKEN_RADIUS + 3,
    y: -9,
    width: (TOKEN_RADIUS - 3) * 2,
    text: hero.initials,
    align: 'center',
    fontFamily: 'Arial, sans-serif',
    fontSize: 17,
    fontStyle: 'bold',
    fill: ROLE_COLORS[hero.role]
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
export function createBoardCanvas(host: HTMLDivElement, events: BoardEvents): BoardCanvas {
  const stage = new Konva.Stage({ container: host, width: 1, height: 1 });
  const mapLayer = new Konva.Layer();
  const tokenLayer = new Konva.Layer();
  stage.add(mapLayer, tokenLayer);
  const drawings = new Map<string, TokenDrawing>();
  const heroImages = new Map<string, HTMLImageElement>();
  let snapshot: BoardSnapshot | null = null;
  let destroyed = false;
  let mapRequest = 0;

  function createDrawing(token: BoardToken, hero: HeroDefinition): TokenDrawing {
    const group = new Konva.Group({ id: token.id, x: token.x, y: token.y, draggable: true });
    const image = heroImages.get(hero.id);
    const portrait = createTokenPortrait(hero, image);
    const ring = new Konva.Circle({ radius: TOKEN_RADIUS, strokeWidth: 3 });
    const drawing: TokenDrawing = { group, ring, portrait, image, token, dragging: false };
    group.add(new Konva.Circle({ radius: TOKEN_RADIUS, fill: '#222326' }), portrait, ring);
    group.dragBoundFunc((position) => snapshot
      ? boundTokenPosition(position, stage.scaleX(), snapshot.map)
      : position);
    group.on('click tap', (event) => {
      event.cancelBubble = true;
      events.onSelect(drawing.token);
    });
    group.on('contextmenu', (event) => {
      event.evt.preventDefault();
      event.cancelBubble = true;
      events.onContextMenu(drawing.token, event.evt.clientX, event.evt.clientY);
    });
    group.on('pointerenter', () => setBoardCursor(stage, 'grab'));
    group.on('pointerleave', () => setBoardCursor(stage, 'default'));
    group.on('dragstart', () => {
      drawing.dragging = true;
      group.moveToTop();
      setBoardCursor(stage, 'grabbing');
      events.onSelect(drawing.token);
    });
    group.on('dragend', () => {
      drawing.dragging = false;
      setBoardCursor(stage, 'grab');
      events.onMove(drawing.token, Math.round(group.x()), Math.round(group.y()));
    });
    tokenLayer.add(group);
    return drawing;
  }

  function renderTokens(current: BoardSnapshot): void {
    const present = new Set(current.tokens
      .filter((token) => HERO_BY_ID.has(token.heroId))
      .map((token) => token.id));
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
      drawing.ring.stroke(selected ? '#ffffff' : TEAM_COLORS[token.team]);
      drawing.ring.strokeWidth(selected ? 4 : 3);
    }
    tokenLayer.batchDraw();
  }

  stage.on('click tap', (event) => {
    if (event.target === stage) events.onSelect(null);
  });
  const resizeObserver = new ResizeObserver(() => {
    if (!destroyed && snapshot) resizeStage(stage, host, snapshot.map);
  });
  resizeObserver.observe(host);

  void Promise.all(HEROES.map(async (hero) => {
    const image = await loadImage(heroImagePath(hero.id));
    return { heroId: hero.id, image };
  })).then((images) => {
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
      snapshot = current;
      if (mapChanged) {
        // A map change ends the old gesture, as stage replacement did before.
        for (const drawing of drawings.values()) {
          drawing.group.off();
          drawing.group.destroy();
        }
        drawings.clear();
        setBoardCursor(stage, 'default');
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
    },
    toBoardPoint(clientX, clientY) {
      // The canvas is centered inside the host, which can have unused space.
      const bounds = stage.getContent().getBoundingClientRect();
      return {
        x: (clientX - bounds.left) / stage.scaleX(),
        y: (clientY - bounds.top) / stage.scaleY()
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      for (const drawing of drawings.values()) drawing.group.off();
      stage.destroy();
      drawings.clear();
      host.style.cursor = '';
    }
  };
}
