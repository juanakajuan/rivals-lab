import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Konva from 'konva';

type Team = 'ally' | 'enemy';
type Role = 'Vanguard' | 'Duelist' | 'Strategist';
type HeroRole = Role | 'All Roles';
type BoardCursor = 'default' | 'grab' | 'grabbing';

interface HeroDefinition {
  id: string;
  name: string;
  initials: string;
  role: HeroRole;
}

interface BoardToken {
  id: string;
  heroId: string;
  team: Team;
  x: number;
  y: number;
}

interface HeroInitialsStyle extends CSSProperties {
  '--role-color': string;
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

interface TokenGroupOptions {
  readonly token: BoardToken;
  readonly hero: HeroDefinition;
  readonly stage: Konva.Stage;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly onMove: (x: number, y: number) => void;
}

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 760;
const GRID_SIZE = 60;
const TOKEN_RADIUS = 30;

const TEAM_LABELS: Readonly<Record<Team, string>> = {
  ally: 'Allies',
  enemy: 'Opponents'
};

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

const HEROES: readonly HeroDefinition[] = [
  { id: 'angela', name: 'Angela', initials: 'AG', role: 'Vanguard' },
  { id: 'captain-america', name: 'Captain America', initials: 'CA', role: 'Vanguard' },
  { id: 'devil-dinosaur', name: 'Devil Dinosaur', initials: 'DD', role: 'Vanguard' },
  { id: 'strange', name: 'Doctor Strange', initials: 'DS', role: 'Vanguard' },
  { id: 'emma-frost', name: 'Emma Frost', initials: 'EF', role: 'Vanguard' },
  { id: 'groot', name: 'Groot', initials: 'GR', role: 'Vanguard' },
  { id: 'hulk', name: 'Hulk', initials: 'HK', role: 'Vanguard' },
  { id: 'magneto', name: 'Magneto', initials: 'MG', role: 'Vanguard' },
  { id: 'peni-parker', name: 'Peni Parker', initials: 'PP', role: 'Vanguard' },
  { id: 'rogue', name: 'Rogue', initials: 'RG', role: 'Vanguard' },
  { id: 'the-hood', name: 'The Hood', initials: 'TH', role: 'Vanguard' },
  { id: 'the-thing', name: 'The Thing', initials: 'TT', role: 'Vanguard' },
  { id: 'thor', name: 'Thor', initials: 'TR', role: 'Vanguard' },
  { id: 'venom', name: 'Venom', initials: 'VN', role: 'Vanguard' },
  { id: 'black-cat', name: 'Black Cat', initials: 'BC', role: 'Duelist' },
  { id: 'black-panther', name: 'Black Panther', initials: 'BP', role: 'Duelist' },
  { id: 'black-widow', name: 'Black Widow', initials: 'BW', role: 'Duelist' },
  { id: 'blade', name: 'Blade', initials: 'BL', role: 'Duelist' },
  { id: 'cyclops', name: 'Cyclops', initials: 'CY', role: 'Duelist' },
  { id: 'daredevil', name: 'Daredevil', initials: 'DD', role: 'Duelist' },
  { id: 'elsa-bloodstone', name: 'Elsa Bloodstone', initials: 'EB', role: 'Duelist' },
  { id: 'hawkeye', name: 'Hawkeye', initials: 'HE', role: 'Duelist' },
  { id: 'hela', name: 'Hela', initials: 'HL', role: 'Duelist' },
  { id: 'human-torch', name: 'Human Torch', initials: 'HT', role: 'Duelist' },
  { id: 'iron-fist', name: 'Iron Fist', initials: 'IF', role: 'Duelist' },
  { id: 'iron-man', name: 'Iron Man', initials: 'IM', role: 'Duelist' },
  { id: 'magik', name: 'Magik', initials: 'MK', role: 'Duelist' },
  { id: 'mister-fantastic', name: 'Mister Fantastic', initials: 'MF', role: 'Duelist' },
  { id: 'moon-knight', name: 'Moon Knight', initials: 'MN', role: 'Duelist' },
  { id: 'namor', name: 'Namor', initials: 'NM', role: 'Duelist' },
  { id: 'phoenix', name: 'Phoenix', initials: 'PX', role: 'Duelist' },
  { id: 'psylocke', name: 'Psylocke', initials: 'PS', role: 'Duelist' },
  { id: 'scarlet-witch', name: 'Scarlet Witch', initials: 'SW', role: 'Duelist' },
  { id: 'spider-man', name: 'Spider-Man', initials: 'SM', role: 'Duelist' },
  { id: 'squirrel-girl', name: 'Squirrel Girl', initials: 'SG', role: 'Duelist' },
  { id: 'star-lord', name: 'Star-Lord', initials: 'SL', role: 'Duelist' },
  { id: 'storm', name: 'Storm', initials: 'ST', role: 'Duelist' },
  { id: 'the-punisher', name: 'The Punisher', initials: 'TP', role: 'Duelist' },
  { id: 'winter-soldier', name: 'Winter Soldier', initials: 'WS', role: 'Duelist' },
  { id: 'wolverine', name: 'Wolverine', initials: 'WV', role: 'Duelist' },
  { id: 'adam-warlock', name: 'Adam Warlock', initials: 'AW', role: 'Strategist' },
  { id: 'cloak-and-dagger', name: 'Cloak & Dagger', initials: 'CD', role: 'Strategist' },
  { id: 'gambit', name: 'Gambit', initials: 'GB', role: 'Strategist' },
  { id: 'invisible-woman', name: 'Invisible Woman', initials: 'IW', role: 'Strategist' },
  {
    id: 'jeff-the-land-shark',
    name: 'Jeff the Land Shark',
    initials: 'JL',
    role: 'Strategist'
  },
  { id: 'jubilee', name: 'Jubilee', initials: 'JB', role: 'Strategist' },
  { id: 'loki', name: 'Loki', initials: 'LK', role: 'Strategist' },
  { id: 'luna', name: 'Luna Snow', initials: 'LS', role: 'Strategist' },
  { id: 'mantis', name: 'Mantis', initials: 'MN', role: 'Strategist' },
  { id: 'rocket', name: 'Rocket Raccoon', initials: 'RR', role: 'Strategist' },
  { id: 'ultron', name: 'Ultron', initials: 'UL', role: 'Strategist' },
  { id: 'white-fox', name: 'White Fox', initials: 'WF', role: 'Strategist' },
  { id: 'deadpool', name: 'Deadpool', initials: 'DP', role: 'All Roles' }
];

const HERO_BY_ID: ReadonlyMap<string, HeroDefinition> = new Map<string, HeroDefinition>(
  HEROES.map((hero): [string, HeroDefinition] => [hero.id, hero])
);

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

function initialTokens(): BoardToken[] {
  return [
    { id: 'ally-strange', heroId: 'strange', team: 'ally', x: 270, y: 435 },
    { id: 'ally-psylocke', heroId: 'psylocke', team: 'ally', x: 380, y: 350 },
    { id: 'ally-luna', heroId: 'luna', team: 'ally', x: 230, y: 520 },
    { id: 'enemy-magneto', heroId: 'magneto', team: 'enemy', x: 865, y: 310 },
    { id: 'enemy-magik', heroId: 'magik', team: 'enemy', x: 960, y: 410 },
    { id: 'enemy-rocket', heroId: 'rocket', team: 'enemy', x: 910, y: 515 }
  ];
}

function drawMap(layer: Konva.Layer): void {
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
    layer.add(
      new Konva.Line({
        points: zone.points,
        closed: true,
        fill: zone.fill,
        stroke: zone.stroke,
        strokeWidth: 3,
        listening: false
      })
    );
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
    new Konva.Circle({
      x: 610,
      y: 395,
      radius: 28,
      fill: '#8a8f98',
      listening: false
    }),
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
        x: label.x,
        y: label.y,
        text: label.text,
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

function resizeStage(stage: Konva.Stage, host: HTMLDivElement): void {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (width <= 0 || height <= 0) return;

  const scale = Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT);
  stage.width(BOARD_WIDTH * scale);
  stage.height(BOARD_HEIGHT * scale);
  stage.scale({ x: scale, y: scale });
  stage.batchDraw();
}

function boundTokenPosition(position: Konva.Vector2d, scale: number): Konva.Vector2d {
  return {
    x: clamp(position.x, TOKEN_RADIUS * scale, (BOARD_WIDTH - TOKEN_RADIUS) * scale),
    y: clamp(position.y, TOKEN_RADIUS * scale, (BOARD_HEIGHT - TOKEN_RADIUS) * scale)
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function setBoardCursor(stage: Konva.Stage, cursor: BoardCursor): void {
  stage.container().style.cursor = cursor;
}

function teamLabel(team: Team): string {
  return TEAM_LABELS[team];
}

function roleColor(role: HeroRole): string {
  return ROLE_COLORS[role];
}

function heroInitialsStyle(role: HeroRole): HeroInitialsStyle {
  return { '--role-color': roleColor(role) };
}

function createTokenGroup({
  token,
  hero,
  stage,
  isSelected,
  onSelect,
  onMove
}: TokenGroupOptions): Konva.Group {
  const group = new Konva.Group({
    x: token.x,
    y: token.y,
    draggable: true,
    dragBoundFunc: (position) => boundTokenPosition(position, stage.scaleX())
  });

  group.add(
    new Konva.Circle({
      radius: TOKEN_RADIUS,
      fill: '#222326',
      stroke: isSelected ? '#ffffff' : TEAM_COLORS[token.team],
      strokeWidth: isSelected ? 4 : 3
    }),
    new Konva.Text({
      x: -27,
      y: -9,
      width: 54,
      text: hero.initials,
      align: 'center',
      fontFamily: 'Arial, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      fill: roleColor(hero.role)
    })
  );

  group.on('click tap', (event) => {
    event.cancelBubble = true;
    onSelect();
  });
  group.on('pointerenter', () => setBoardCursor(stage, 'grab'));
  group.on('pointerleave', () => setBoardCursor(stage, 'default'));
  group.on('dragstart', () => {
    group.moveToTop();
    setBoardCursor(stage, 'grabbing');
  });
  group.on('dragend', () => {
    onMove(Math.round(group.x()), Math.round(group.y()));
    setBoardCursor(stage, 'grab');
  });

  return group;
}

function updateTokenPosition(
  tokens: readonly BoardToken[],
  tokenId: string,
  x: number,
  y: number
): BoardToken[] {
  return tokens.map((token) => {
    if (token.id !== tokenId) return token;
    return { ...token, x, y };
  });
}

export default function App(): React.JSX.Element {
  const boardHostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const tokenLayerRef = useRef<Konva.Layer | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team>('ally');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [heroSearch, setHeroSearch] = useState('');
  const [tokens, setTokens] = useState<BoardToken[]>(initialTokens);
  const [announcement, setAnnouncement] = useState(
    'Drag any token to explain a rotation or position.'
  );

  const selectedToken = tokens.find((token) => token.id === selectedTokenId);
  const selectedHero = selectedToken ? HERO_BY_ID.get(selectedToken.heroId) : undefined;
  const allyCount = tokens.filter((token) => token.team === 'ally').length;
  const enemyCount = tokens.filter((token) => token.team === 'enemy').length;
  const normalizedHeroSearch = heroSearch.trim().toLocaleLowerCase();
  const visibleHeroes = HEROES.filter((hero) =>
    hero.name.toLocaleLowerCase().includes(normalizedHeroSearch)
  );

  useEffect(() => {
    const host = boardHostRef.current;
    if (!host) return;

    const stage = new Konva.Stage({
      container: host,
      width: 1,
      height: 1
    });
    const mapLayer = new Konva.Layer();
    const tokenLayer = new Konva.Layer();

    stageRef.current = stage;
    tokenLayerRef.current = tokenLayer;
    stage.add(mapLayer, tokenLayer);
    drawMap(mapLayer);

    stage.on('click tap', (event) => {
      if (event.target === stage) setSelectedTokenId(null);
    });

    const resizeObserver = new ResizeObserver(() => resizeStage(stage, host));
    resizeObserver.observe(host);
    resizeStage(stage, host);

    return () => {
      resizeObserver.disconnect();
      stage.destroy();
      stageRef.current = null;
      tokenLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = tokenLayerRef.current;
    const stage = stageRef.current;
    if (!layer || !stage) return;

    layer.destroyChildren();

    for (const token of tokens) {
      const hero = HERO_BY_ID.get(token.heroId);
      if (!hero) continue;

      const group = createTokenGroup({
        token,
        hero,
        stage,
        isSelected: token.id === selectedTokenId,
        onSelect: () => {
          setSelectedTokenId(token.id);
          setAnnouncement(`${hero.name} selected.`);
        },
        onMove: (x, y) => {
          setSelectedTokenId(token.id);
          setTokens((currentTokens) => updateTokenPosition(currentTokens, token.id, x, y));
          setAnnouncement(`${hero.name} moved to ${x}, ${y}.`);
        }
      });

      layer.add(group);
    }

    layer.draw();
  }, [tokens, selectedTokenId]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent): void {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTokenId) {
        event.preventDefault();
        removeSelected();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  function addHero(hero: HeroDefinition): void {
    const id = `${selectedTeam}-${hero.id}`;
    if (tokens.some((token) => token.id === id)) {
      setSelectedTokenId(id);
      setAnnouncement(`${hero.name} is already with ${teamLabel(selectedTeam)}.`);
      return;
    }

    const index = tokens.filter((token) => token.team === selectedTeam).length;
    const token: BoardToken = {
      id,
      heroId: hero.id,
      team: selectedTeam,
      x: selectedTeam === 'ally' ? 130 + (index % 3) * 72 : 1070 - (index % 3) * 72,
      y: 580 - Math.floor(index / 3) * 78
    };

    setTokens((currentTokens) => [...currentTokens, token]);
    setSelectedTokenId(token.id);
    setAnnouncement(`${hero.name} added to ${teamLabel(selectedTeam)}.`);
  }

  function removeToken(token: BoardToken): void {
    const heroName = HERO_BY_ID.get(token.heroId)?.name ?? 'Hero';
    setTokens((currentTokens) =>
      currentTokens.filter((current) => current.id !== token.id)
    );
    setSelectedTokenId((currentId) => (currentId === token.id ? null : currentId));
    setAnnouncement(`${heroName} removed from the board.`);
  }

  function removeSelected(): void {
    if (selectedToken) removeToken(selectedToken);
  }

  function resetBoard(): void {
    setTokens(initialTokens());
    setSelectedTokenId(null);
    setAnnouncement('The example formation is restored.');
  }

  function clearBoard(): void {
    setTokens([]);
    setSelectedTokenId(null);
    setAnnouncement('The board is clear.');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-group">
          <strong>Rivals Lab</strong>
          <span>Position Board</span>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={clearBoard}>
            Clear
          </button>
          <button className="primary-button" type="button" onClick={resetBoard}>
            Reset
          </button>
        </div>
      </header>

      <main className="app-main">
        <aside className="hero-panel" aria-labelledby="heroes-heading">
          <div className="sidebar-heading">
            <h2 id="heroes-heading">Heroes</h2>
            <p>Choose a team, then add or remove heroes.</p>
          </div>

          <div className="team-picker" aria-label="Team for new heroes">
            <button
              className={`team-option blue${selectedTeam === 'ally' ? ' active' : ''}`}
              type="button"
              aria-pressed={selectedTeam === 'ally'}
              onClick={() => setSelectedTeam('ally')}
            >
              Allies <span>{allyCount}</span>
            </button>
            <button
              className={`team-option red${selectedTeam === 'enemy' ? ' active' : ''}`}
              type="button"
              aria-pressed={selectedTeam === 'enemy'}
              onClick={() => setSelectedTeam('enemy')}
            >
              Opponents <span>{enemyCount}</span>
            </button>
          </div>

          <div className="hero-search">
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <circle cx="7" cy="7" r="4.25" />
              <path d="m10.25 10.25 3.25 3.25" />
            </svg>
            <input
              type="search"
              value={heroSearch}
              onChange={(event) => setHeroSearch(event.currentTarget.value)}
              placeholder="Search heroes"
              aria-label="Search heroes"
            />
            {heroSearch.length > 0 ? (
              <button
                type="button"
                onClick={() => setHeroSearch('')}
                aria-label="Clear hero search"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="hero-list">
            {visibleHeroes.map((hero) => {
              const placedToken = tokens.find(
                (token) => token.id === `${selectedTeam}-${hero.id}`
              );
              const isPlaced = placedToken !== undefined;

              return (
                <button
                  className={`hero-row${isPlaced ? ' placed' : ''}`}
                  type="button"
                  onClick={() => (placedToken ? removeToken(placedToken) : addHero(hero))}
                  key={hero.id}
                >
                  <span className="hero-initials" style={heroInitialsStyle(hero.role)}>
                    {hero.initials}
                  </span>
                  <span className="hero-name">
                    <strong>{hero.name}</strong>
                    <small>{hero.role}</small>
                  </span>
                  <span className="row-action">{isPlaced ? 'Remove' : 'Add'}</span>
                </button>
              );
            })}
          </div>
          {visibleHeroes.length === 0 ? (
            <p className="hero-empty">No heroes match “{heroSearch.trim()}”.</p>
          ) : null}
        </aside>

        <section className="board-panel" aria-labelledby="board-heading">
          <div className="board-heading">
            <div>
              <h1 id="board-heading">Krakoa</h1>
              <p>Placeholder map</p>
            </div>
            <div className="legend">
              <span>
                <i className="blue-dot" />Allies
              </span>
              <span>
                <i className="red-dot" />Opponents
              </span>
              <span>
                <i className="objective-dot" />Objective
              </span>
            </div>
          </div>

          <div className="board-shell">
            <div
              className="stage-host"
              ref={boardHostRef}
              aria-label="Placeholder overhead map of Krakoa with draggable hero position tokens"
            />
          </div>

          {selectedToken && selectedHero ? (
            <div className="selection-bar">
              <span
                className={`selection-team ${
                  selectedToken.team === 'ally' ? 'blue-team' : 'red-team'
                }`}
              />
              <div className="selection-name">
                <strong>{selectedHero.name}</strong>
                <span>{teamLabel(selectedToken.team)}</span>
              </div>
              <span className="coordinates">
                x {selectedToken.x}, y {selectedToken.y}
              </span>
            </div>
          ) : (
            <p className="board-help">
              Drag a hero to change its position. Use the hero list to add or remove heroes.
            </p>
          )}
        </section>
      </main>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
