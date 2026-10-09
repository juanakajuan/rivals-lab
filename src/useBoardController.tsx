import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Redo2, Undo2 } from "lucide-react";

import { BoardPanel, HeroPanel, type BoardUploadState } from "./AppPanels";
import { DrawingTools } from "./DrawingTools";
import {
  drawingLimitMessage,
  type BoardDrawing,
  type BoardTool,
} from "./boardDrawings";
import { measureBoardNote } from "./boardNote";
import type { Comp } from "./comps";
import { createBoardCanvas, type BoardCanvas } from "./boardCanvas";
import {
  HERO_BY_ID,
  HEROES,
  isTeam,
  teamLabel,
  type HeroDefinition,
  type Team,
} from "./heroes";
import {
  BoardSession,
  type BoardState,
  type HeroPlacement,
} from "./boardSession";
import type { BoardToken, IconSize } from "./boardTokens";
import type { Workspace } from "./appData";
import { normalizeSearch } from "./searchText";
import { getMap, isMapId, type GameMode, type MapId } from "./maps";

import {
  resolveBoardMap,
  uploadBoardMap,
  type BoardMapId,
  type CustomBoardMap,
  type SelectedBoardMap,
} from "./boardMaps";

import { ContextMenu, contextMenuPosition } from "./ui/ContextMenu";

type BoardContextMenu = {
  readonly x: number;
  readonly y: number;
} & (
  | { readonly kind: "token"; readonly id: string }
  | { readonly kind: "drawing"; readonly id: string }
);

const EMPTY_DRAWINGS: readonly BoardDrawing[] = [];

const HERO_DRAG_TYPE = "application/x-rivals-hero";
const TEAM_DRAG_TYPE = "application/x-rivals-team";

export interface BoardController {
  readonly headerActions: ReactNode;
  readonly content: ReactNode;
  readonly overlays: ReactNode;
  readonly openComp: (comp: Comp, mapIds: readonly MapId[]) => boolean;
  readonly dismissMenu: () => void;
  readonly document: {
    readonly board: BoardState;
    readonly iconSize: IconSize;
    readonly customMaps: readonly CustomBoardMap[];
  };
}

export function useBoardController({
  active,
  workspace,
}: {
  readonly active: boolean;
  readonly workspace: Workspace;
}): BoardController {
  const boardHostRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<BoardCanvas | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team>("ally");
  const [session] = useState(
    () =>
      new BoardSession(measureBoardNote, workspace.board, workspace.iconSize),
  );
  const [boardState, setBoardState] = useState(session.state);
  const [customMaps, setCustomMaps] = useState<readonly CustomBoardMap[]>(
    workspace.customMaps,
  );
  const [uploadState, setUploadState] = useState<BoardUploadState>({
    kind: "idle",
  });
  const uploadGeneration = useRef(0);
  useEffect(
    () => () => {
      uploadGeneration.current += 1;
    },
    [],
  );
  const [tool, setTool] = useState<BoardTool>("move");
  const [drawingColor, setDrawingColor] = useState("#ffd166");
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(
    null,
  );
  const { map: selectedBoardMap, iconSize, mode: gameMode } = boardState;
  const tokens = session.visibleTokens();
  const selectedMapId = selectedBoardMap.id;
  const mapDrawings = boardState.drawingsByMap[selectedMapId] ?? EMPTY_DRAWINGS;
  const selectedDrawing = mapDrawings.find(
    (drawing) => drawing.id === selectedDrawingId,
  );
  const selectedMap = resolveBoardMap(selectedBoardMap);
  const document = useMemo(
    () => ({
      board: boardState,
      iconSize,
      customMaps,
    }),
    [boardState, customMaps, iconSize],
  );
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [heroSearch, setHeroSearch] = useState("");
  const [isHeroDragging, setIsHeroDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<BoardContextMenu | null>(null);
  const [announcement, setAnnouncement] = useState(
    "Drag any token to explain a rotation or position.",
  );
  const selectedToken = tokens.find((token) => token.id === selectedTokenId);
  const selectedHero = selectedToken
    ? HERO_BY_ID.get(selectedToken.heroId)
    : undefined;
  const contextToken =
    contextMenu?.kind === "token"
      ? tokens.find((token) => token.id === contextMenu.id)
      : undefined;
  const contextDrawing =
    contextMenu?.kind === "drawing"
      ? mapDrawings.find((drawing) => drawing.id === contextMenu.id)
      : undefined;
  const contextHero = contextToken
    ? HERO_BY_ID.get(contextToken.heroId)
    : undefined;
  const allyCount = tokens.filter((token) => token.team === "ally").length;
  const enemyCount = tokens.filter((token) => token.team === "enemy").length;
  const normalizedHeroSearch = normalizeSearch(heroSearch);
  const visibleHeroes = HEROES.filter(
    (hero) =>
      normalizeSearch(hero.name).includes(normalizedHeroSearch) ||
      normalizeSearch(hero.role).includes(normalizedHeroSearch),
  );

  const showDrawingEdit = useCallback(
    (drawing: BoardDrawing): void => {
      setBoardState(session.state);
      setSelectedDrawingId(drawing.id);
      setSelectedTokenId(null);
      setAnnouncement(`${drawing.kind} updated.`);
    },
    [session],
  );

  const editDrawing = useCallback(
    (drawing: BoardDrawing): void => {
      const before = session.state;
      const next = session.editDrawing(drawing);
      const exists = (before.drawingsByMap[before.map.id] ?? []).some(
        (item) => item.id === drawing.id,
      );
      if (next === before && !exists) {
        setAnnouncement(drawingLimitMessage());
        return;
      }
      showDrawingEdit(drawing);
    },
    [session, showDrawingEdit],
  );

  useEffect(() => {
    const host = boardHostRef.current;
    if (!host) return;

    const board = createBoardCanvas(host, {
      onDrawingSelect: (drawing) => {
        setSelectedDrawingId(drawing?.id ?? null);
        setAnnouncement(
          drawing ? `${drawing.kind} selected.` : "Selection cleared.",
        );
        setSelectedTokenId(null);
        setContextMenu(null);
      },
      onDrawingEdit: editDrawing,
      onDrawingContextMenu: openDrawingMenu,
      onSelect: (token) => {
        setSelectedDrawingId(null);
        setSelectedTokenId(token?.id ?? null);
        if (!token) {
          setContextMenu(null);
          return;
        }
        setAnnouncement(
          `${HERO_BY_ID.get(token.heroId)?.name ?? "Hero"} selected.`,
        );
      },
      onMove: (token, x, y) => {
        setBoardState(session.moveToken({ id: token.id, point: { x, y } }));
        setAnnouncement(
          `${HERO_BY_ID.get(token.heroId)?.name ?? "Hero"} moved to ${x}, ${y}.`,
        );
      },
      onContextMenu: (token, clientX, clientY) => {
        setSelectedDrawingId(null);
        setSelectedTokenId(token.id);
        setContextMenu({
          kind: "token",
          id: token.id,
          ...contextMenuPosition(clientX, clientY),
        });
        setAnnouncement(
          `${HERO_BY_ID.get(token.heroId)?.name ?? "Hero"} menu opened.`,
        );
      },
    });
    boardRef.current = board;
    return () => {
      board.destroy();
      boardRef.current = null;
    };
  }, [editDrawing, session]);

  useEffect(() => {
    boardRef.current?.update({
      map: selectedMap,
      tokens,
      selectedTokenId,
      iconSize,
      drawings: mapDrawings,
      tool,
      drawingColor,
      selectedDrawingId,
    });
  }, [
    selectedMap,
    tokens,
    selectedTokenId,
    iconSize,
    mapDrawings,
    tool,
    drawingColor,
    selectedDrawingId,
  ]);

  useEffect(() => {
    setSelectedDrawingId((id) =>
      mapDrawings.some((drawing) => drawing.id === id) ? id : null,
    );
    setContextMenu((menu) =>
      menu?.kind === "drawing" &&
      !mapDrawings.some((drawing) => drawing.id === menu.id)
        ? null
        : menu,
    );
  }, [mapDrawings]);

  useEffect(() => {
    setSelectedTokenId((id) =>
      tokens.some((token) => token.id === id) ? id : null,
    );
    setContextMenu((menu) =>
      menu &&
      (menu.kind === "drawing" || tokens.some((token) => token.id === menu.id))
        ? menu
        : null,
    );
  }, [tokens]);

  useEffect(() => {
    function handleClick(): void {
      setContextMenu(null);
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (!active) return;
      if (event.key === "Escape") {
        setContextMenu(null);
        return;
      }
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, select")))
      )
        return;
      const key = event.key.toLowerCase();
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (key === "z" ||
          (event.ctrlKey && !event.metaKey && !event.shiftKey && key === "y"))
      ) {
        event.preventDefault();
        restoreBoard(event.shiftKey || key === "y" ? "redo" : "undo");
        return;
      }
      if (
        selectedDrawing &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        moveSelectedDrawing(
          event.key === "ArrowLeft" ? -10 : event.key === "ArrowRight" ? 10 : 0,
          event.key === "ArrowUp" ? -10 : event.key === "ArrowDown" ? 10 : 0,
        );
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (selectedTokenId || selectedDrawingId)
      ) {
        event.preventDefault();
        removeSelected();
      }
    }

    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  function showHeroPlacement(
    hero: HeroDefinition,
    result: HeroPlacement,
  ): void {
    setBoardState(session.state);
    setTool("move");
    setSelectedDrawingId(null);
    setSelectedTokenId(result.token.id);
    setAnnouncement(
      result.kind === "moved"
        ? `${hero.name} moved to ${result.token.x}, ${result.token.y}.`
        : `${hero.name} added to ${teamLabel(result.token.team)}.`,
    );
  }

  function placeHero(
    hero: HeroDefinition,
    x: number,
    y: number,
    team: Team,
  ): void {
    showHeroPlacement(
      hero,
      session.placeHero({ heroId: hero.id, team, point: { x, y } }),
    );
  }

  function addHero(hero: HeroDefinition): void {
    const result = session.addHero({
      heroId: hero.id,
      team: selectedTeam,
    });
    if (result.kind === "added" || result.kind === "moved") {
      showHeroPlacement(hero, result);
    } else if (result.kind === "full") {
      setAnnouncement(
        `No free position for ${hero.name}. Move or remove a hero first.`,
      );
    }
  }

  function handleHeroDragStart(
    event: React.DragEvent<HTMLDivElement>,
    hero: HeroDefinition,
  ): void {
    changeTool("move");
    event.dataTransfer.effectAllowed = "copyMove";
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
    const heroName = HERO_BY_ID.get(token.heroId)?.name ?? "Hero";
    setBoardState(session.removeToken(token.id));
    setSelectedTokenId((currentId) =>
      currentId === token.id ? null : currentId,
    );
    setContextMenu(null);
    setAnnouncement(`${heroName} removed from the board.`);
  }

  function moveSelectedDrawing(dx: number, dy: number): void {
    if (!selectedDrawing) return;
    const drawing = session.moveDrawing({
      id: selectedDrawing.id,
      delta: { x: dx, y: dy },
    });
    if (drawing) showDrawingEdit(drawing);
  }

  function changeTool(next: BoardTool): void {
    setTool(next);
    setSelectedDrawingId(null);
    setSelectedTokenId(null);
    setContextMenu(null);
  }

  function openDrawingMenu(
    drawing: BoardDrawing,
    clientX: number,
    clientY: number,
  ): void {
    setSelectedDrawingId(drawing.id);
    setSelectedTokenId(null);
    setContextMenu({
      kind: "drawing",
      id: drawing.id,
      ...contextMenuPosition(clientX, clientY),
    });
    setAnnouncement(`${drawing.kind} menu opened.`);
  }

  function removeDrawing(drawing: BoardDrawing): void {
    setBoardState(session.removeDrawing(drawing.id));
    setSelectedDrawingId(null);
    setContextMenu(null);
    setAnnouncement("Drawing removed.");
  }

  function removeSelected(): void {
    if (selectedDrawing) removeDrawing(selectedDrawing);
    if (selectedToken) removeToken(selectedToken);
  }

  function handleBoardKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
  ): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" && mapDrawings.length) {
      event.preventDefault();
      const next =
        mapDrawings[
          (mapDrawings.findIndex(
            (drawing) => drawing.id === selectedDrawingId,
          ) +
            1) %
            mapDrawings.length
        ];
      if (!next) return;
      setSelectedDrawingId(next.id);
      setSelectedTokenId(null);
      setContextMenu(null);
      setAnnouncement(`${next.kind} selected.`);
    }
    if (event.shiftKey && event.key === "F10" && selectedDrawing) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      openDrawingMenu(selectedDrawing, bounds.left + 16, bounds.top + 16);
    }
  }

  function resetBoard(): void {
    setBoardState(session.reset());
    setSelectedTokenId(null);
    setAnnouncement("The example formation is restored.");
  }

  function clearBoard(): void {
    setBoardState(session.clear());
    setSelectedTokenId(null);
    setAnnouncement("The board is clear.");
  }

  function cancelUpload(): void {
    uploadGeneration.current += 1;
    setUploadState({ kind: "idle" });
  }

  async function uploadMap(file: File): Promise<boolean> {
    const generation = ++uploadGeneration.current;
    setUploadState({ kind: "loading", filename: file.name });
    const result = await uploadBoardMap(file, customMaps);
    if (generation !== uploadGeneration.current) return false;
    if (result.kind === "error") {
      setUploadState(result);
      return false;
    }
    setCustomMaps((maps) => [...maps, result.map]);
    setUploadState({ kind: "idle" });
    setBoardState(session.changeMap(result.map));
    setSelectedDrawingId(null);
    setContextMenu(null);
    setAnnouncement(`${result.map.name} selected.`);
    return true;
  }

  function findBoardMap(mapId: BoardMapId): SelectedBoardMap | undefined {
    return isMapId(mapId)
      ? ({ kind: "builtin", id: mapId } satisfies SelectedBoardMap)
      : customMaps.find((map) => map.id === mapId);
  }

  function changeMap(mapId: BoardMapId): void {
    chooseMaps([mapId]);
  }

  function chooseMaps(mapIds: readonly BoardMapId[]): void {
    cancelUpload();
    const selected = mapIds.flatMap((id) => findBoardMap(id) ?? []);
    const [first] = selected;
    if (!first) return;
    setBoardState(session.selectMaps(selected));
    setSelectedDrawingId(null);
    setContextMenu(null);
    setAnnouncement(
      selected.length === 1
        ? `${resolveBoardMap(first).name} selected.`
        : `${selected.length} maps selected.`,
    );
  }

  function chooseMode(mode: GameMode): void {
    cancelUpload();
    setBoardState(session.selectMode(mode));
    setTool("move");
    setSelectedDrawingId(null);
    setContextMenu(null);
    setAnnouncement(`${mode} game mode selected. Positions are off.`);
  }

  function selectMapTab(mapId: BoardMapId): void {
    setBoardState(session.setActiveMap(mapId));
    setSelectedDrawingId(null);
    setContextMenu(null);
    const map = findBoardMap(mapId);
    if (map) setAnnouncement(`${resolveBoardMap(map).name} tab selected.`);
  }

  function openComp(comp: Comp, mapIds: readonly MapId[]): boolean {
    cancelUpload();
    if (
      tokens.length &&
      !window.confirm(
        "Replace the current Position Board placements with this comp?",
      )
    )
      return false;
    setBoardState(session.openComp({ comp, mapIds }));
    setSelectedTokenId(null);
    setContextMenu(null);
    const target = comp.gameMode
      ? `${comp.gameMode} game mode`
      : mapIds.map((id) => getMap(id).name).join(", ");
    setAnnouncement(`${comp.name || "Comp"} opened on ${target}.`);
    return true;
  }

  function restoreBoard(type: "undo" | "redo"): void {
    cancelUpload();
    if (type === "undo" ? !boardState.canUndo : !boardState.canRedo) return;
    setBoardState(type === "undo" ? session.undo() : session.redo());
    setContextMenu(null);
    setAnnouncement(
      type === "undo" ? "Board edit undone." : "Board edit restored.",
    );
  }

  const dismissMenu = useCallback((): void => setContextMenu(null), []);

  return {
    headerActions: (
      <div className="header-actions" hidden={!active}>
        <button
          className="secondary-button history-button"
          type="button"
          disabled={!boardState.canUndo}
          onClick={() => restoreBoard("undo")}
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo"
          aria-keyshortcuts="Control+z Meta+z"
        >
          <Undo2 size={16} aria-hidden="true" />
        </button>
        <button
          className="secondary-button history-button"
          type="button"
          disabled={!boardState.canRedo}
          onClick={() => restoreBoard("redo")}
          title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo"
          aria-keyshortcuts="Control+Shift+z Meta+Shift+z"
        >
          <Redo2 size={16} aria-hidden="true" />
        </button>
        <button className="secondary-button" type="button" onClick={clearBoard}>
          Clear
        </button>
        <button className="primary-button" type="button" onClick={resetBoard}>
          Reset
        </button>
      </div>
    ),
    content: (
      <main className="app-main" hidden={!active}>
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
          onHeroAdd={addHero}
          onHeroRemove={removeToken}
        />
        <BoardPanel
          drawingControls={
            gameMode ? null : (
              <DrawingTools
                tool={tool}
                color={drawingColor}
                selected={selectedDrawing}
                onTool={changeTool}
                onColor={setDrawingColor}
                onEdit={editDrawing}
                onAdd={() => {
                  if (tool === "move") return;
                  const drawing = session.addDrawing({
                    kind: tool,
                    color: drawingColor,
                  });
                  if (!drawing) {
                    setAnnouncement(drawingLimitMessage());
                    return;
                  }
                  showDrawingEdit(drawing);
                }}
              />
            )
          }
          selectedMapId={selectedMapId}
          maps={boardState.maps}
          gameMode={gameMode}
          onMapsChange={chooseMaps}
          onModeChange={chooseMode}
          onMapTabChange={selectMapTab}
          selectedMap={selectedMap}
          customMaps={customMaps}
          uploadState={uploadState}
          onUpload={uploadMap}
          onMapPickerClose={cancelUpload}
          isHeroDragging={isHeroDragging}
          boardHostRef={boardHostRef}
          selectedToken={selectedToken}
          selectedHero={selectedHero}
          iconSize={iconSize}
          onIconSizeChange={(size) => setBoardState(session.setIconSize(size))}
          onMapChange={changeMap}
          onDrop={handleBoardDrop}
          onKeyDown={handleBoardKeyDown}
        />
      </main>
    ),
    overlays: (
      <>
        {contextMenu && contextToken && contextHero ? (
          <ContextMenu
            position={contextMenu}
            label={`${contextHero.name} actions`}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => removeToken(contextToken)}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="M3.5 5.5h13M8 3h4l1 2.5H7L8 3Zm-2.5 2.5.8 11h7.4l.8-11M8.3 8v6M11.7 8v6" />
              </svg>
              Remove {contextHero.name}
            </button>
          </ContextMenu>
        ) : null}
        {contextMenu && contextDrawing ? (
          <ContextMenu
            position={contextMenu}
            label={`${contextDrawing.kind} actions`}
          >
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() => removeDrawing(contextDrawing)}
            >
              Remove {contextDrawing.kind}
            </button>
          </ContextMenu>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </>
    ),
    openComp,
    dismissMenu,
    document,
  };
}
