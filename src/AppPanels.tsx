import {
  Fragment,
  type ComponentProps,
  type KeyboardEvent,
  type DragEvent,
  type ReactNode,
  type RefObject,
  useRef,
} from "react";
import { Plus, Trash2 } from "lucide-react";

import type { BoardDrawing } from "./boardDrawings";
import type { BoardToken } from "./boardTokens";
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
import { Avatar, AvatarImage } from "./components/ui/avatar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Separator } from "./components/ui/separator";
import { Slider } from "./components/ui/slider";
import { Toggle } from "./components/ui/toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./components/ui/dropdown-menu";

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

        <div
          className="team-picker"
          role="group"
          aria-label="Team for new heroes"
        >
          <Toggle
            size="sm"
            variant="outline"
            pressed={selectedTeam === "ally"}
            onPressedChange={() => onTeamChange("ally")}
          >
            Allies <Badge variant="secondary">{allyCount}</Badge>
          </Toggle>
          <Toggle
            size="sm"
            variant="outline"
            pressed={selectedTeam === "enemy"}
            onPressedChange={() => onTeamChange("enemy")}
          >
            Opponents <Badge variant="secondary">{enemyCount}</Badge>
          </Toggle>
        </div>

        <div className="hero-search">
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="4.25" />
            <path d="m10.25 10.25 3.25 3.25" />
          </svg>
          <Input
            type="search"
            value={heroSearch}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder="Search heroes"
            aria-label="Search heroes"
          />
          {heroSearch.length > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear hero search"
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div className="hero-list">
        {visibleHeroes.map((hero, index) => {
          const tokenId = `${selectedTeam}-${hero.id}`;
          const token = tokens.find((token) => token.id === tokenId);

          return (
            <Fragment key={hero.id}>
              {index > 0 && visibleHeroes[index - 1]?.role !== hero.role ? (
                <Separator className="hero-role-divider" />
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
      <Avatar>
        <AvatarImage src={heroImagePath(hero.id)} alt="" />
      </Avatar>
      <span className="hero-name">
        <strong>{hero.name}</strong>
        <small>{hero.role}</small>
      </span>
      <Button
        variant="outline"
        size="icon"
        className="row-action"
        type="button"
        aria-label={actionLabel}
        title={actionLabel}
        onClick={() => (token ? onRemove(token) : onAdd(hero))}
      >
        {token ? (
          <Trash2 size={18} aria-hidden="true" />
        ) : (
          <Plus size={18} aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

interface BoardPanelProps {
  readonly active: boolean;
  readonly drawingControls: ReactNode;
  readonly iconSize: number;
  readonly onIconSizeChange: (size: number) => void;
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
  active,
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
  const uploadInput = useRef<HTMLInputElement>(null);
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
            active={active}
            options={mapOptions}
            selectedValue={selectedMapId}
            triggerLabel="Choose map"
            title="Choose map"
            onChoose={onMapChange}
            onClose={onMapPickerClose}
            renderActions={(close) => (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => uploadInput.current?.click()}
                >
                  Upload image
                </Button>
                <input
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-label="Upload map image"
                  tabIndex={-1}
                  ref={uploadInput}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) {
                      void onUpload(file).then((selected) => {
                        if (selected) close();
                      });
                    }
                  }}
                />
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
        <div className="icon-size-control">
          <Label>Hero icon size</Label>
          {active ? (
            <Slider
              className="icon-size-slider"
              min={50}
              max={150}
              step={10}
              value={[iconSize]}
              thumbProps={{
                "aria-label": "Hero icon size",
                "aria-valuetext": `${iconSize}%`,
              }}
              onValueChange={(value) => {
                const size = typeof value === "number" ? value : value[0];
                if (size !== undefined) onIconSizeChange(size);
              }}
            />
          ) : null}
          <span aria-hidden="true">{iconSize}%</span>
        </div>
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

interface CanvasMenuProps {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly action: string;
  readonly onRemove: () => void;
  readonly onClose: () => void;
  readonly finalFocus: NonNullable<
    ComponentProps<typeof DropdownMenuContent>["finalFocus"]
  >;
}

function CanvasMenu({
  x,
  y,
  label,
  action,
  onRemove,
  onClose,
  finalFocus,
}: CanvasMenuProps): React.JSX.Element {
  const removeRef = useRef<HTMLDivElement>(null);
  function containKeys(event: KeyboardEvent<HTMLDivElement>): void {
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") &&
      !event.nativeEvent.isComposing
    )
      return;
    event.stopPropagation();
  }

  return (
    <DropdownMenu
      open
      onOpenChangeComplete={(open) => {
        if (open) removeRef.current?.focus();
      }}
      onOpenChange={(open, details) => {
        if (details.reason === "escape-key" && details.event.isComposing) {
          details.cancel();
          return;
        }
        if (!open) onClose();
      }}
      modal={false}
    >
      <DropdownMenuContent
        anchor={{ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) }}
        positionMethod="fixed"
        sideOffset={0}
        className="w-auto min-w-40"
        aria-label={label}
        finalFocus={finalFocus}
        onKeyDown={containKeys}
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem
          ref={removeRef}
          variant="destructive"
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
          {action}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TokenMenuProps extends Pick<
  CanvasMenuProps,
  "x" | "y" | "onClose" | "finalFocus"
> {
  readonly token: BoardToken;
  readonly hero: HeroDefinition;
  readonly onRemove: (token: BoardToken) => void;
}

export function TokenMenu({
  token,
  hero,
  onRemove,
  ...props
}: TokenMenuProps): React.JSX.Element {
  return (
    <CanvasMenu
      {...props}
      label={`${hero.name} actions`}
      action={`Remove ${hero.name}`}
      onRemove={() => onRemove(token)}
    />
  );
}

interface DrawingMenuProps extends Pick<
  CanvasMenuProps,
  "x" | "y" | "onClose" | "finalFocus"
> {
  readonly drawing: BoardDrawing;
  readonly onRemove: (drawing: BoardDrawing) => void;
}

export function DrawingMenu({
  drawing,
  onRemove,
  ...props
}: DrawingMenuProps): React.JSX.Element {
  return (
    <CanvasMenu
      {...props}
      label={`${drawing.kind} actions`}
      action={`Remove ${drawing.kind}`}
      onRemove={() => onRemove(drawing)}
    />
  );
}
