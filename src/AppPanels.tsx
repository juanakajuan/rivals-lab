import { SearchField } from "./ui/SearchField";
import { FilePickerButton } from "./ui/FilePickerButton";
import {
  Fragment,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  boardTokenId,
  ICON_SIZES,
  type BoardToken,
  type IconSize,
} from "./boardTokens";
import {
  heroImagePath,
  teamLabel,
  type HeroDefinition,
  type Team,
} from "./heroes";
import type {
  BoardMapDefinition,
  BoardMapId,
  CustomBoardMap,
} from "./boardMaps";
import { MapPicker } from "./MapPicker";
import { BOARD_MAP_OPTIONS } from "./mapPickerOptions";

export type BoardUploadState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly filename: string }
  | { readonly kind: "error"; readonly message: string };

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
    hero: HeroDefinition,
  ) => void;
  readonly onHeroDragEnd: () => void;
  readonly onHeroAdd: (hero: HeroDefinition) => void;
  readonly onHeroRemove: (token: BoardToken) => void;
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
  onHeroDragEnd,
  onHeroAdd,
  onHeroRemove,
}: HeroPanelProps): React.JSX.Element {
  return (
    <aside className="hero-panel" aria-labelledby="heroes-heading">
      <div className="hero-panel-header">
        <div className="sidebar-heading">
          <h2 id="heroes-heading">Heroes</h2>
          <p>Choose a team, then add or drag a hero onto the map.</p>
        </div>

        <div className="team-picker" aria-label="Team for new heroes">
          <button
            className={`team-option blue${selectedTeam === "ally" ? " active" : ""}`}
            type="button"
            aria-pressed={selectedTeam === "ally"}
            onClick={() => onTeamChange("ally")}
          >
            Allies <span>{allyCount}</span>
          </button>
          <button
            className={`team-option red${selectedTeam === "enemy" ? " active" : ""}`}
            type="button"
            aria-pressed={selectedTeam === "enemy"}
            onClick={() => onTeamChange("enemy")}
          >
            Opponents <span>{enemyCount}</span>
          </button>
        </div>

        <SearchField
          wrapper="div"
          className="hero-search"
          label="Search heroes"
          placeholder="Search heroes"
          value={heroSearch}
          onValueChange={onSearchChange}
          clearLabel="Clear hero search"
          icon={
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <circle cx="7" cy="7" r="4.25" />
              <path d="m10.25 10.25 3.25 3.25" />
            </svg>
          }
        />
      </div>

      <div className="hero-list">
        {visibleHeroes.map((hero, index) => {
          const tokenId = boardTokenId(selectedTeam, hero.id);
          const token = tokens.find((token) => token.id === tokenId);

          return (
            <Fragment key={hero.id}>
              {index > 0 && visibleHeroes[index - 1]?.role !== hero.role ? (
                <hr className="hero-role-divider" />
              ) : null}
              <HeroRow
                hero={hero}
                team={selectedTeam}
                token={token}
                onDragStart={onHeroDragStart}
                onDragEnd={onHeroDragEnd}
                onAdd={onHeroAdd}
                onRemove={onHeroRemove}
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
  readonly token: BoardToken | undefined;
  readonly onDragStart: (
    event: DragEvent<HTMLDivElement>,
    hero: HeroDefinition,
  ) => void;
  readonly onDragEnd: () => void;
  readonly onAdd: (hero: HeroDefinition) => void;
  readonly onRemove: (token: BoardToken) => void;
}

function HeroRow({
  hero,
  team,
  token,
  onDragStart,
  onDragEnd,
  onAdd,
  onRemove,
}: HeroRowProps): React.JSX.Element {
  const actionLabel = token
    ? `Remove ${hero.name} from ${teamLabel(team)}`
    : `Add ${hero.name} to ${teamLabel(team)}`;

  return (
    <div
      className={`hero-row${token ? " placed" : ""}`}
      data-team={team}
      draggable
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
      <button
        className="row-action"
        type="button"
        aria-label={actionLabel}
        title={actionLabel}
        onClick={() => (token ? onRemove(token) : onAdd(hero))}
      >
        {token ? (
          <Trash2 size={14} aria-hidden="true" />
        ) : (
          <Plus size={14} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

interface BoardPanelProps {
  readonly drawingControls: ReactNode;
  readonly iconSize: IconSize;
  readonly onIconSizeChange: (size: IconSize) => void;
  readonly selectedMapId: BoardMapId;
  readonly selectedMap: BoardMapDefinition;
  readonly customMaps: readonly CustomBoardMap[];
  readonly uploadState: BoardUploadState;
  readonly onUpload: (file: File) => Promise<boolean>;
  readonly onMapPickerClose: () => void;
  readonly isHeroDragging: boolean;
  readonly boardHostRef: RefObject<HTMLDivElement | null>;
  readonly selectedToken: BoardToken | undefined;
  readonly selectedHero: HeroDefinition | undefined;
  readonly onMapChange: (mapId: BoardMapId) => void;
  readonly onDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function BoardPanel({
  drawingControls,
  iconSize,
  onIconSizeChange,
  selectedMapId,
  selectedMap,
  customMaps,
  uploadState,
  onUpload,
  onMapPickerClose,
  isHeroDragging,
  boardHostRef,
  selectedToken,
  selectedHero,
  onMapChange,
  onDrop,
  onKeyDown,
}: BoardPanelProps): React.JSX.Element {
  const mapOptions = [
    ...BOARD_MAP_OPTIONS,
    ...customMaps.map((map) => ({
      value: map.id,
      name: map.name,
      detail: map.mode,
      imagePath: map.imagePath,
      imageSize: [map.width, map.height] satisfies readonly [number, number],
    })),
  ];

  function allowDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  return (
    <section className="board-panel" aria-labelledby="board-heading">
      <div className="board-heading">
        <div className="map-title">
          <h1 id="board-heading">{selectedMap.name}</h1>
          <p>{selectedMap.mode}</p>
        </div>
        <div className="board-heading-actions">
          <MapPicker<BoardMapId>
            options={mapOptions}
            selectedValue={selectedMapId}
            triggerLabel="Choose map"
            title="Choose map"
            onChoose={onMapChange}
            onClose={onMapPickerClose}
            renderActions={(close) => (
              <>
                <FilePickerButton
                  buttonClassName="map-picker-trigger"
                  inputAppearance="sr-only"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  inputLabel="Upload map image"
                  onFile={(file) => {
                    void onUpload(file).then((selected) => {
                      if (selected) close();
                    });
                  }}
                >
                  Upload image
                </FilePickerButton>
                {uploadState.kind === "loading" ? (
                  <p className="map-upload-message" role="status">
                    Loading {uploadState.filename}...
                  </p>
                ) : null}
                {uploadState.kind === "error" ? (
                  <p
                    className="map-upload-message map-upload-error"
                    role="alert"
                  >
                    {uploadState.message}
                  </p>
                ) : null}
              </>
            )}
          />
        </div>
      </div>

      {drawingControls}
      <div
        className={`board-shell${isHeroDragging ? " drop-ready" : ""}`}
        style={{ aspectRatio: `${selectedMap.width} / ${selectedMap.height}` }}
        onDragOver={allowDrop}
        onDrop={onDrop}
      >
        <div
          className="stage-host"
          tabIndex={0}
          onKeyDown={onKeyDown}
          ref={boardHostRef}
          style={{
            aspectRatio: `${selectedMap.width} / ${selectedMap.height}`,
          }}
          aria-label={`Overhead map of ${selectedMap.name} with draggable heroes and drawings. Press Enter to select the next drawing, arrow keys to move it, Delete to remove it, or Shift+F10 for its menu.`}
        />
      </div>

      <div className="board-toolbar">
        <label className="icon-size-control">
          <span>Hero icon size</span>
          <input
            type="range"
            min={ICON_SIZES[0]}
            max={ICON_SIZES[ICON_SIZES.length - 1]}
            step={ICON_SIZES[1] - ICON_SIZES[0]}
            value={iconSize}
            aria-valuetext={`${iconSize}%`}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              const size = ICON_SIZES.find((candidate) => candidate === value);
              if (size !== undefined) onIconSizeChange(size);
            }}
          />
          <span aria-hidden="true">{iconSize}%</span>
        </label>
        {selectedToken && selectedHero ? (
          <SelectionSummary token={selectedToken} hero={selectedHero} />
        ) : (
          <p className="board-help">
            Add or drag heroes onto the map. Right-click a token to remove it.
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

function SelectionSummary({
  token,
  hero,
}: SelectionSummaryProps): React.JSX.Element {
  const teamClass = token.team === "ally" ? "blue-team" : "red-team";

  return (
    <div className="selection-summary">
      <span className={`selection-team ${teamClass}`} />
      <div className="selection-name">
        <strong>
          {hero.name}
          {token.deadpoolRole ? ` · ${token.deadpoolRole}` : ""}
        </strong>
        <span>{teamLabel(token.team)} · Press Delete to remove</span>
      </div>
      <span className="coordinates">
        x {token.x}, y {token.y}
      </span>
    </div>
  );
}
