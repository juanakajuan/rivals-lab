import { Fragment, type DragEvent, type RefObject } from 'react';
import { CircleCheck, Move } from 'lucide-react';

import type { BoardToken } from './boardCanvas';
import { heroImagePath, teamLabel, type HeroDefinition, type Team } from './heroes';
import { MAPS, type MapDefinition, type MapId } from './maps';

interface HeroPanelProps {
  readonly selectedTeam: Team;
  readonly allyCount: number;
  readonly enemyCount: number;
  readonly heroSearch: string;
  readonly visibleHeroes: readonly HeroDefinition[];
  readonly tokens: readonly BoardToken[];
  readonly onTeamChange: (team: Team) => void;
  readonly onSearchChange: (search: string) => void;
  readonly onHeroDragStart: (
    event: DragEvent<HTMLDivElement>,
    hero: HeroDefinition
  ) => void;
  readonly onHeroDragEnd: () => void;
}

export function HeroPanel({
  selectedTeam,
  allyCount,
  enemyCount,
  heroSearch,
  visibleHeroes,
  tokens,
  onTeamChange,
  onSearchChange,
  onHeroDragStart,
  onHeroDragEnd
}: HeroPanelProps): React.JSX.Element {
  return (
    <aside className="hero-panel" aria-labelledby="heroes-heading">
      <div className="sidebar-heading">
        <h2 id="heroes-heading">Heroes</h2>
        <p>Choose a team, then drag a hero onto the map.</p>
      </div>

      <div className="team-picker" aria-label="Team for new heroes">
        <button
          className={`team-option blue${selectedTeam === 'ally' ? ' active' : ''}`}
          type="button"
          aria-pressed={selectedTeam === 'ally'}
          onClick={() => onTeamChange('ally')}
        >
          Allies <span>{allyCount}</span>
        </button>
        <button
          className={`team-option red${selectedTeam === 'enemy' ? ' active' : ''}`}
          type="button"
          aria-pressed={selectedTeam === 'enemy'}
          onClick={() => onTeamChange('enemy')}
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
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="Search heroes"
          aria-label="Search heroes"
        />
        {heroSearch.length > 0 ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear hero search"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="hero-list">
        {visibleHeroes.map((hero, index) => {
          const tokenId = `${selectedTeam}-${hero.id}`;
          const isPlaced = tokens.some((token) => token.id === tokenId);

          return (
            <Fragment key={hero.id}>
              {index > 0 && visibleHeroes[index - 1]?.role !== hero.role ? (
                <hr className="hero-role-divider" />
              ) : null}
              <HeroRow
                hero={hero}
                team={selectedTeam}
                isPlaced={isPlaced}
                onDragStart={onHeroDragStart}
                onDragEnd={onHeroDragEnd}
              />
            </Fragment>
          );
        })}
      </div>
      {visibleHeroes.length === 0 ? (
        <p className="hero-empty">No heroes match “{heroSearch.trim()}”.</p>
      ) : null}
    </aside>
  );
}

interface HeroRowProps {
  readonly hero: HeroDefinition;
  readonly team: Team;
  readonly isPlaced: boolean;
  readonly onDragStart: (event: DragEvent<HTMLDivElement>, hero: HeroDefinition) => void;
  readonly onDragEnd: () => void;
}

function HeroRow({
  hero,
  team,
  isPlaced,
  onDragStart,
  onDragEnd
}: HeroRowProps): React.JSX.Element {
  return (
    <div
      className={`hero-row${isPlaced ? ' placed' : ''}`}
      draggable
      role="button"
      tabIndex={0}
      aria-label={`Drag ${hero.name} onto the map for ${teamLabel(team)}`}
      onDragStart={(event) => onDragStart(event, hero)}
      onDragEnd={onDragEnd}
    >
      <span className="hero-avatar">
        <img src={heroImagePath(hero.id)} alt="" />
      </span>
      <span className="hero-name">
        <strong>{hero.name}</strong>
        <small>{hero.role}</small>
      </span>
      <span className="row-action" aria-hidden="true">
        {isPlaced ? <CircleCheck /> : <Move />}
      </span>
    </div>
  );
}

interface BoardPanelProps {
  readonly selectedMapId: MapId;
  readonly selectedMap: MapDefinition;
  readonly isHeroDragging: boolean;
  readonly boardHostRef: RefObject<HTMLDivElement | null>;
  readonly selectedToken: BoardToken | undefined;
  readonly selectedHero: HeroDefinition | undefined;
  readonly onMapChange: (mapId: string) => void;
  readonly onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export function BoardPanel({
  selectedMapId,
  selectedMap,
  isHeroDragging,
  boardHostRef,
  selectedToken,
  selectedHero,
  onMapChange,
  onDrop
}: BoardPanelProps): React.JSX.Element {
  function allowDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  return (
    <section className="board-panel" aria-labelledby="board-heading">
      <div className="board-heading">
        <div className="map-title">
          <h1 id="board-heading">{selectedMap.name}</h1>
          <p>{selectedMap.mode}</p>
        </div>
        <div className="board-heading-actions">
          <label className="map-picker">
            <span>Map</span>
            <select
              value={selectedMapId}
              onChange={(event) => onMapChange(event.currentTarget.value)}
            >
              {MAPS.map((map) => (
                <option value={map.id} key={map.id}>
                  {map.name} · {map.mode}
                </option>
              ))}
            </select>
          </label>
          <div className="legend">
            <span>
              <i className="blue-dot" />Allies
            </span>
            <span>
              <i className="red-dot" />Opponents
            </span>
          </div>
        </div>
      </div>

      <div
        className={`board-shell${isHeroDragging ? ' drop-ready' : ''}`}
        onDragOver={allowDrop}
        onDrop={onDrop}
      >
        <div
          className="stage-host"
          ref={boardHostRef}
          style={{ aspectRatio: `${selectedMap.width} / ${selectedMap.height}` }}
          aria-label={`Overhead map of ${selectedMap.name} with draggable hero position tokens`}
        />
      </div>

      <div className="board-toolbar">
        {selectedToken && selectedHero ? (
          <SelectionSummary token={selectedToken} hero={selectedHero} />
        ) : (
          <p className="board-help">
            Drag heroes onto the map. Right-click a token to remove it.
          </p>
        )}
      </div>
    </section>
  );
}

interface SelectionSummaryProps {
  readonly token: BoardToken;
  readonly hero: HeroDefinition;
}

function SelectionSummary({ token, hero }: SelectionSummaryProps): React.JSX.Element {
  const teamClass = token.team === 'ally' ? 'blue-team' : 'red-team';

  return (
    <div className="selection-summary">
      <span className={`selection-team ${teamClass}`} />
      <div className="selection-name">
        <strong>{hero.name}</strong>
        <span>{teamLabel(token.team)} · Press Delete to remove</span>
      </div>
      <span className="coordinates">
        x {token.x}, y {token.y}
      </span>
    </div>
  );
}

interface TokenMenuProps {
  readonly x: number;
  readonly y: number;
  readonly token: BoardToken;
  readonly hero: HeroDefinition;
  readonly onRemove: (token: BoardToken) => void;
}

export function TokenMenu({ x, y, token, hero, onRemove }: TokenMenuProps): React.JSX.Element {
  return (
    <div
      className="token-context-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label={`${hero.name} actions`}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={() => onRemove(token)}>
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M3.5 5.5h13M8 3h4l1 2.5H7L8 3Zm-2.5 2.5.8 11h7.4l.8-11M8.3 8v6M11.7 8v6" />
        </svg>
        Remove {hero.name}
      </button>
    </div>
  );
}
