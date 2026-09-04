import { useEffect, useRef, useState } from 'react';
import Konva from 'konva';

import { BoardPanel, HeroPanel, TokenMenu } from './AppPanels';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clampToBoard,
  createTokenGroup,
  drawMap,
  resizeStage,
  type BoardToken
} from './boardCanvas';
import {
  HERO_BY_ID,
  HEROES,
  heroImagePath,
  isTeam,
  teamLabel,
  type HeroDefinition,
  type Team
} from './heroes';
import { updateTokenSelection } from './tokenSelection';

interface TokenContextMenu {
  readonly tokenId: string;
  readonly x: number;
  readonly y: number;
}

const HERO_DRAG_TYPE = 'application/x-rivals-hero';
const TEAM_DRAG_TYPE = 'application/x-rivals-team';

function loadHeroImage(
  hero: HeroDefinition
): Promise<readonly [string, HTMLImageElement] | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve([hero.id, image]);
    image.onerror = () => resolve(null);
    image.src = heroImagePath(hero.id);
  });
}

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
  const [isHeroDragging, setIsHeroDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<TokenContextMenu | null>(null);
  const [tokens, setTokens] = useState<BoardToken[]>(initialTokens);
  const [heroImages, setHeroImages] = useState<ReadonlyMap<string, HTMLImageElement>>(
    () => new Map<string, HTMLImageElement>()
  );
  const [announcement, setAnnouncement] = useState(
    'Drag any token to explain a rotation or position.'
  );

  const selectedToken = tokens.find((token) => token.id === selectedTokenId);
  const selectedHero = selectedToken ? HERO_BY_ID.get(selectedToken.heroId) : undefined;
  const contextToken = contextMenu
    ? tokens.find((token) => token.id === contextMenu.tokenId)
    : undefined;
  const contextHero = contextToken ? HERO_BY_ID.get(contextToken.heroId) : undefined;
  const allyCount = tokens.filter((token) => token.team === 'ally').length;
  const enemyCount = tokens.filter((token) => token.team === 'enemy').length;
  const normalizedHeroSearch = heroSearch.trim().toLocaleLowerCase();
  const visibleHeroes = HEROES.filter((hero) =>
    hero.name.toLocaleLowerCase().includes(normalizedHeroSearch)
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.all(HEROES.map(loadHeroImage)).then((loadedImages) => {
      if (!cancelled) {
        const availableImages = loadedImages.filter(
          (entry): entry is readonly [string, HTMLImageElement] => entry !== null
        );
        setHeroImages(new Map<string, HTMLImageElement>(availableImages));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
      setContextMenu(null);
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
        heroImage: heroImages.get(hero.id),
        stage,
        onSelect: () => {
          setSelectedTokenId(token.id);
          setAnnouncement(`${hero.name} selected.`);
        },
        onMove: (x, y) => {
          setTokens((currentTokens) => updateTokenPosition(currentTokens, token.id, x, y));
          setAnnouncement(`${hero.name} moved to ${x}, ${y}.`);
        },
        onContextMenu: (clientX, clientY) => {
          setSelectedTokenId(token.id);
          setContextMenu({
            tokenId: token.id,
            x: Math.max(8, Math.min(clientX, window.innerWidth - 168)),
            y: Math.max(8, Math.min(clientY, window.innerHeight - 52))
          });
          setAnnouncement(`${hero.name} menu opened.`);
        }
      });

      layer.add(group);
    }

    layer.draw();
  }, [tokens, heroImages]);

  useEffect(() => {
    const layer = tokenLayerRef.current;
    if (!layer) return;

    updateTokenSelection(layer, selectedTokenId);
    layer.batchDraw();
  }, [tokens, selectedTokenId, heroImages]);

  useEffect(() => {
    function handleClick(): void {
      setContextMenu(null);
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setContextMenu(null);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTokenId) {
        event.preventDefault();
        removeSelected();
      }
    }

    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  function placeHero(hero: HeroDefinition, x: number, y: number, team: Team): void {
    const id = `${team}-${hero.id}`;
    const boardX = clampToBoard(x, BOARD_WIDTH);
    const boardY = clampToBoard(y, BOARD_HEIGHT);
    const existingToken = tokens.find((token) => token.id === id);

    if (existingToken) {
      setTokens((currentTokens) => updateTokenPosition(currentTokens, id, boardX, boardY));
      setSelectedTokenId(id);
      setAnnouncement(`${hero.name} moved to ${boardX}, ${boardY}.`);
      return;
    }

    const token: BoardToken = { id, heroId: hero.id, team, x: boardX, y: boardY };
    setTokens((currentTokens) => [...currentTokens, token]);
    setSelectedTokenId(token.id);
    setAnnouncement(`${hero.name} added to ${teamLabel(team)}.`);
  }

  function handleHeroDragStart(event: React.DragEvent<HTMLDivElement>, hero: HeroDefinition): void {
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(HERO_DRAG_TYPE, hero.id);
    event.dataTransfer.setData(TEAM_DRAG_TYPE, selectedTeam);
    setIsHeroDragging(true);
    setAnnouncement(`Dragging ${hero.name}. Drop on the map.`);
  }

  function handleBoardDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsHeroDragging(false);

    const heroId = event.dataTransfer.getData(HERO_DRAG_TYPE);
    const teamValue = event.dataTransfer.getData(TEAM_DRAG_TYPE);
    const hero = HERO_BY_ID.get(heroId);
    if (!hero || !isTeam(teamValue)) return;

    const stage = stageRef.current;
    if (!stage) return;
    const stageBounds = stage.container().getBoundingClientRect();
    const scale = stage.scaleX();
    placeHero(
      hero,
      (event.clientX - stageBounds.left) / scale,
      (event.clientY - stageBounds.top) / scale,
      teamValue
    );
  }

  function removeToken(token: BoardToken): void {
    const heroName = HERO_BY_ID.get(token.heroId)?.name ?? 'Hero';
    setTokens((currentTokens) =>
      currentTokens.filter((current) => current.id !== token.id)
    );
    setSelectedTokenId((currentId) => (currentId === token.id ? null : currentId));
    setContextMenu(null);
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
        <HeroPanel
          selectedTeam={selectedTeam}
          allyCount={allyCount}
          enemyCount={enemyCount}
          heroSearch={heroSearch}
          visibleHeroes={visibleHeroes}
          tokens={tokens}
          onTeamChange={setSelectedTeam}
          onSearchChange={setHeroSearch}
          onHeroDragStart={handleHeroDragStart}
          onHeroDragEnd={() => setIsHeroDragging(false)}
        />
        <BoardPanel
          isHeroDragging={isHeroDragging}
          boardHostRef={boardHostRef}
          selectedToken={selectedToken}
          selectedHero={selectedHero}
          onDrop={handleBoardDrop}
        />
      </main>

      {contextMenu && contextToken && contextHero ? (
        <TokenMenu
          x={contextMenu.x}
          y={contextMenu.y}
          token={contextToken}
          hero={contextHero}
          onRemove={removeToken}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
