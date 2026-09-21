import { useEffect, useRef, useState } from 'react';

import { BoardPanel, HeroPanel, TokenMenu } from './AppPanels';
import {
  clampToBoard,
  createBoardCanvas,
  type BoardCanvas,
  type BoardToken
} from './boardCanvas';
import {
  HERO_BY_ID,
  HEROES,
  isTeam,
  teamLabel,
  type HeroDefinition,
  type Team
} from './heroes';
import { DEFAULT_MAP_ID, getMap, isMapId, type MapId } from './maps';

interface TokenContextMenu {
  readonly tokenId: string;
  readonly x: number;
  readonly y: number;
}

const HERO_DRAG_TYPE = 'application/x-rivals-hero';
const TEAM_DRAG_TYPE = 'application/x-rivals-team';

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
  const boardRef = useRef<BoardCanvas | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team>('ally');
  const [selectedMapId, setSelectedMapId] = useState<MapId>(DEFAULT_MAP_ID);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [heroSearch, setHeroSearch] = useState('');
  const [isHeroDragging, setIsHeroDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<TokenContextMenu | null>(null);
  const [tokens, setTokens] = useState<BoardToken[]>(initialTokens);
  const [announcement, setAnnouncement] = useState(
    'Drag any token to explain a rotation or position.'
  );
  const selectedMap = getMap(selectedMapId);

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
    const host = boardHostRef.current;
    if (!host) return;

    const board = createBoardCanvas(host, {
      onSelect: (token) => {
        setSelectedTokenId(token?.id ?? null);
        if (!token) {
          setContextMenu(null);
          return;
        }
        setAnnouncement(`${HERO_BY_ID.get(token.heroId)?.name ?? 'Hero'} selected.`);
      },
      onMove: (token, x, y) => {
        setTokens((current) => updateTokenPosition(current, token.id, x, y));
        setAnnouncement(`${HERO_BY_ID.get(token.heroId)?.name ?? 'Hero'} moved to ${x}, ${y}.`);
      },
      onContextMenu: (token, clientX, clientY) => {
        setSelectedTokenId(token.id);
        setContextMenu({
          tokenId: token.id,
          x: Math.max(8, Math.min(clientX, window.innerWidth - 168)),
          y: Math.max(8, Math.min(clientY, window.innerHeight - 52))
        });
        setAnnouncement(`${HERO_BY_ID.get(token.heroId)?.name ?? 'Hero'} menu opened.`);
      }
    });
    boardRef.current = board;
    return () => {
      board.destroy();
      boardRef.current = null;
    };
  }, []);

  useEffect(() => {
    boardRef.current?.update({ map: selectedMap, tokens, selectedTokenId });
  }, [selectedMap, tokens, selectedTokenId]);

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
    const boardX = clampToBoard(x, selectedMap.width);
    const boardY = clampToBoard(y, selectedMap.height);
    const existingToken = tokens.find((token) => token.id === id);
    setSelectedTokenId(id);

    if (existingToken) {
      setTokens((currentTokens) => updateTokenPosition(currentTokens, id, boardX, boardY));
      setAnnouncement(`${hero.name} moved to ${boardX}, ${boardY}.`);
      return;
    }

    const token: BoardToken = { id, heroId: hero.id, team, x: boardX, y: boardY };
    setTokens((currentTokens) => [...currentTokens, token]);
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

    const board = boardRef.current;
    if (!board) return;
    const point = board.toBoardPoint(event.clientX, event.clientY);
    placeHero(hero, point.x, point.y, teamValue);
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

  function changeMap(value: string): void {
    if (!isMapId(value)) return;
    const map = getMap(value);
    setSelectedMapId(value);
    setTokens((currentTokens) => currentTokens.map((token) => ({
      ...token,
      x: clampToBoard(token.x, map.width),
      y: clampToBoard(token.y, map.height)
    })));
    setContextMenu(null);
    setAnnouncement(`${map.name} selected.`);
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
          selectedMapId={selectedMapId}
          selectedMap={selectedMap}
          isHeroDragging={isHeroDragging}
          boardHostRef={boardHostRef}
          selectedToken={selectedToken}
          selectedHero={selectedHero}
          onMapChange={changeMap}
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
