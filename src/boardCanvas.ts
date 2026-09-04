import Konva from 'konva';

import type { HeroDefinition, HeroRole, Team } from './heroes';
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
  readonly onSelect: () => void;
  readonly onMove: (x: number, y: number) => void;
  readonly onContextMenu: (clientX: number, clientY: number) => void;
}

interface MapZone {
  readonly points: number[];
  readonly fill: string;
  readonly stroke: string;
}

interface MapLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

type BoardCursor = 'default' | 'grab' | 'grabbing';

export const BOARD_WIDTH = 1200;
export const BOARD_HEIGHT = 760;
export const TOKEN_RADIUS = 30;
const GRID_SIZE = 60;

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

const MAP_ZONES: readonly MapZone[] = [
  {
    points: [48, 94, 270, 46, 366, 166, 330, 305, 116, 330, 38, 236],
    fill: '#191a1d',
    stroke: '#303137'
  },
  {
    points: [432, 68, 762, 48, 866, 178, 790, 312, 444, 298, 370, 176],
    fill: '#17181b',
    stroke: '#2d2e33'
  },
  {
    points: [866, 86, 1144, 116, 1170, 312, 1038, 352, 842, 278],
    fill: '#1b1c20',
    stroke: '#323339'
  },
  {
    points: [54, 410, 260, 344, 420, 462, 340, 690, 98, 714, 34, 574],
    fill: '#18191c',
    stroke: '#2e2f34'
  },
  {
    points: [456, 378, 754, 348, 850, 510, 710, 704, 448, 682, 374, 520],
    fill: '#1c1d20',
    stroke: '#33343a'
  },
  {
    points: [894, 392, 1138, 358, 1172, 568, 1084, 710, 830, 674, 804, 520],
    fill: '#17181b',
    stroke: '#2d2e33'
  }
];

const ROUTE_POINTS = [
  92, 550, 250, 480, 390, 420, 530, 390, 650, 390, 798, 430, 938, 474, 1110, 530
];

const MAP_LABELS: readonly MapLabel[] = [
  { x: 88, y: 170, text: 'WEST GROVE' },
  { x: 505, y: 144, text: 'GALA HALL' },
  { x: 920, y: 192, text: 'EAST GARDEN' },
  { x: 470, y: 610, text: 'LOWER WALK' }
];

function addSpawnZone(
  layer: Konva.Layer,
  x: number,
  y: number,
  label: string,
  color: string
): void {
  layer.add(
    new Konva.Circle({
      x,
      y,
      radius: 58,
      fill: 'rgba(255, 255, 255, 0.025)',
      stroke: color,
      strokeWidth: 2,
      listening: false
    }),
    new Konva.Text({
      x: x - 18,
      y: y - 19,
      width: 36,
      text: label,
      align: 'center',
      fontFamily: 'Arial, sans-serif',
      fontSize: 38,
      fontStyle: 'bold',
      fill: color,
      opacity: 0.7,
      listening: false
    })
  );
}

export function drawMap(layer: Konva.Layer): void {
  layer.add(
    new Konva.Rect({
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      fill: '#111214',
      listening: false
    })
  );

  for (let x = 0; x <= BOARD_WIDTH; x += GRID_SIZE) {
    layer.add(
      new Konva.Line({
        points: [x, 0, x, BOARD_HEIGHT],
        stroke: 'rgba(255, 255, 255, 0.05)',
        strokeWidth: 1,
        listening: false
      })
    );
  }
  for (let y = 0; y <= BOARD_HEIGHT; y += GRID_SIZE) {
    layer.add(
      new Konva.Line({
        points: [0, y, BOARD_WIDTH, y],
        stroke: 'rgba(255, 255, 255, 0.05)',
        strokeWidth: 1,
        listening: false
      })
    );
  }
  for (const zone of MAP_ZONES) {
    layer.add(new Konva.Line({ ...zone, closed: true, strokeWidth: 3, listening: false }));
  }

  layer.add(
    new Konva.Line({
      points: ROUTE_POINTS,
      stroke: '#2b2d31',
      strokeWidth: 18,
      lineCap: 'round',
      lineJoin: 'round',
      listening: false
    }),
    new Konva.Line({
      points: ROUTE_POINTS,
      stroke: '#5f626a',
      strokeWidth: 2,
      lineCap: 'round',
      listening: false
    })
  );
  addSpawnZone(layer, 116, 540, 'A', '#57b9ff');
  addSpawnZone(layer, 1084, 530, 'B', '#ff696d');

  layer.add(
    new Konva.Circle({
      x: 610,
      y: 395,
      radius: 74,
      fill: 'rgba(138, 143, 152, 0.08)',
      stroke: '#8a8f98',
      strokeWidth: 2,
      listening: false
    }),
    new Konva.Circle({ x: 610, y: 395, radius: 28, fill: '#8a8f98', listening: false }),
    new Konva.Text({
      x: 566,
      y: 462,
      width: 88,
      text: 'OBJECTIVE',
      align: 'center',
      fontFamily: 'Arial, sans-serif',
      fontSize: 14,
      fontStyle: 'bold',
      fill: '#c6c8ce',
      listening: false
    })
  );
  for (const label of MAP_LABELS) {
    layer.add(
      new Konva.Text({
        ...label,
        fontFamily: 'Arial, sans-serif',
        fontSize: 17,
        fontStyle: 'bold',
        fill: 'rgba(255, 255, 255, 0.28)',
        listening: false
      })
    );
  }
  layer.draw();
}

export function resizeStage(stage: Konva.Stage, host: HTMLDivElement): void {
  const { clientWidth: width, clientHeight: height } = host;
  if (width <= 0 || height <= 0) return;

  const scale = Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT);
  stage.width(BOARD_WIDTH * scale);
  stage.height(BOARD_HEIGHT * scale);
  stage.scale({ x: scale, y: scale });
  stage.batchDraw();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clampToBoard(value: number, maximum: number): number {
  return Math.round(clamp(value, TOKEN_RADIUS, maximum - TOKEN_RADIUS));
}

function boundTokenPosition(position: Konva.Vector2d, scale: number): Konva.Vector2d {
  return {
    x: clamp(position.x, TOKEN_RADIUS * scale, (BOARD_WIDTH - TOKEN_RADIUS) * scale),
    y: clamp(position.y, TOKEN_RADIUS * scale, (BOARD_HEIGHT - TOKEN_RADIUS) * scale)
  };
}

function setBoardCursor(stage: Konva.Stage, cursor: BoardCursor): void {
  stage.container().style.cursor = cursor;
}

export function createTokenGroup(options: TokenGroupOptions): Konva.Group {
  const { token, hero, heroImage, stage, onSelect, onMove, onContextMenu } = options;
  const group = new Konva.Group({
    x: token.x,
    y: token.y,
    draggable: true,
    dragBoundFunc: (position) => boundTokenPosition(position, stage.scaleX())
  });

  group.add(new Konva.Circle({ radius: TOKEN_RADIUS, fill: '#222326' }));
  if (heroImage) {
    group.add(new Konva.Image({
      x: -TOKEN_RADIUS + 3,
      y: -TOKEN_RADIUS + 3,
      width: (TOKEN_RADIUS - 3) * 2,
      height: (TOKEN_RADIUS - 3) * 2,
      image: heroImage,
      cornerRadius: TOKEN_RADIUS - 3
    }));
  } else {
    group.add(new Konva.Text({
      x: -27,
      y: -9,
      width: 54,
      text: hero.initials,
      align: 'center',
      fontFamily: 'Arial, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      fill: ROLE_COLORS[hero.role]
    }));
  }

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
