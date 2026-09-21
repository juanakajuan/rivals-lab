import Konva from 'konva';

import type { HeroDefinition, HeroRole, Team } from './heroes';
import type { MapDefinition } from './maps';
import { bindTokenDragLifecycle } from './tokenDrag';
import { configureTokenSelection } from './tokenSelection';

export interface BoardToken {
  readonly id: string;
  readonly heroId: string;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
}

interface TokenGroupOptions {
  readonly token: BoardToken;
  readonly hero: HeroDefinition;
  readonly heroImage: HTMLImageElement | undefined;
  readonly stage: Konva.Stage;
  readonly map: MapDefinition;
  readonly onSelect: () => void;
  readonly onMove: (x: number, y: number) => void;
  readonly onContextMenu: (clientX: number, clientY: number) => void;
}

type BoardCursor = 'default' | 'grab' | 'grabbing';

export const TOKEN_RADIUS = 26;

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

export function drawMap(
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

export function resizeStage(
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

export function createTokenGroup(options: TokenGroupOptions): Konva.Group {
  const { token, hero, heroImage, stage, map, onSelect, onMove, onContextMenu } = options;
  const group = new Konva.Group({
    x: token.x,
    y: token.y,
    draggable: true,
    dragBoundFunc: (position) => boundTokenPosition(position, stage.scaleX(), map)
  });

  group.add(new Konva.Circle({ radius: TOKEN_RADIUS, fill: '#222326' }));
  group.add(createTokenPortrait(hero, heroImage));

  const selectionRing = new Konva.Circle({
    radius: TOKEN_RADIUS,
    stroke: TEAM_COLORS[token.team],
    strokeWidth: 3
  });
  configureTokenSelection(group, selectionRing, token.id, TEAM_COLORS[token.team]);
  group.add(selectionRing);

  group.on('click tap', (event) => {
    event.cancelBubble = true;
    onSelect();
  });
  group.on('contextmenu', (event) => {
    event.evt.preventDefault();
    event.cancelBubble = true;
    onContextMenu(event.evt.clientX, event.evt.clientY);
  });
  group.on('pointerenter', () => setBoardCursor(stage, 'grab'));
  group.on('pointerleave', () => setBoardCursor(stage, 'default'));
  bindTokenDragLifecycle(group, {
    onSelect,
    onDragStart: () => {
      group.moveToTop();
      setBoardCursor(stage, 'grabbing');
    },
    onDragEnd: (x, y) => {
      onMove(x, y);
      setBoardCursor(stage, 'grab');
    }
  });
  return group;
}
