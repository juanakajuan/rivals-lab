import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button, buttonVariants } from "./components/ui/button";
import { ConfirmAction, type ConfirmationCopy } from "./ConfirmAction";
import { visibleFocusTarget } from "./overlayFocus";

import {
  BoardPanel,
  DrawingMenu,
  HeroPanel,
  TokenMenu,
  type BoardUploadState,
} from "./AppPanels";
import { DrawingTools } from "./DrawingTools";
import type { BoardDrawing, BoardTool } from "./boardDrawings";
import { measureBoardNote } from "./boardNote";
import { Changelog } from "./Changelog";
import { CompBuilder } from "./CompBuilder";
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
import { BoardSession, type HeroPlacement } from "./boardSession";
import { clampToBoard, type BoardToken } from "./boardTokens";
import { getMap, isMapId, type MapId } from "./maps";

import {
  resolveBoardMap,
  uploadBoardMap,
  type BoardMapId,
  type CustomBoardMap,
  type SelectedBoardMap,
} from "./boardMaps";

type Page = "board" | "builder" | "changelog";

function pageFromPath(): Page {
  switch (window.location.pathname) {
    case "/builder":
      return "builder";
    case "/changelog":
      return "changelog";
    default:
      return "board";
  }
}

type BoardContextMenu = {
  readonly x: number;
  readonly y: number;
} & (
  | { readonly kind: "token"; readonly id: string }
  | { readonly kind: "drawing"; readonly id: string }
);

interface BoardReplacement {
  readonly comp: Comp;
  readonly mapId: MapId;
}

const BOARD_REPLACEMENT_COPY: ConfirmationCopy = {
  title: "Replace board placements?",
  description: "Replace the current Position Board placements with this comp?",
  confirmLabel: "Replace placements",
};

const EMPTY_DRAWINGS: readonly BoardDrawing[] = [];

const HERO_DRAG_TYPE = "application/x-rivals-hero";
const TEAM_DRAG_TYPE = "application/x-rivals-team";

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>(pageFromPath);
  const [boardReplacement, setBoardReplacement] =
    useState<BoardReplacement | null>(null);
  const replacementOpener = useRef<HTMLElement | null>(null);
  const boardHostRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<BoardCanvas | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team>("ally");
  const [session] = useState(() => new BoardSession(measureBoardNote));
  const [boardState, setBoardState] = useState(session.state);
  const [customMaps, setCustomMaps] = useState<readonly CustomBoardMap[]>([]);
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
  const [iconSize, setIconSize] = useState(100);
  const { map: selectedBoardMap, tokens: savedTokens } = boardState;
  const selectedMapId = selectedBoardMap.id;
  const mapDrawings = boardState.drawingsByMap[selectedMapId] ?? EMPTY_DRAWINGS;
  const selectedDrawing = mapDrawings.find(
    (drawing) => drawing.id === selectedDrawingId,
  );
  const selectedMap = resolveBoardMap(selectedBoardMap);
  const tokens = useMemo(
    () =>
      savedTokens.map((token) => ({
        ...token,
        x: clampToBoard(token.x, selectedMap.width, iconSize),
        y: clampToBoard(token.y, selectedMap.height, iconSize),
      })),
    [savedTokens, selectedMap, iconSize],
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
  const normalizedHeroSearch = heroSearch.trim().toLocaleLowerCase();
  const visibleHeroes = HEROES.filter((hero) =>
    hero.name.toLocaleLowerCase().includes(normalizedHeroSearch),
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
      session.editDrawing(drawing);
      showDrawingEdit(drawing);
    },
    [session, showDrawingEdit],
  );

  useEffect(() => {
    function handlePopState(): void {
      setPage(pageFromPath());
      setContextMenu(null);
      setBoardReplacement(null);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(nextPage: Page): void {
    const path = `/${nextPage}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setPage(nextPage);
    setContextMenu(null);
    setBoardReplacement(null);
  }

  function handlePageLink(
    event: React.MouseEvent<HTMLAnchorElement>,
    nextPage: Page,
  ): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(nextPage);
  }

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
          x: clientX,
          y: clientY,
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
    function handleKeydown(event: KeyboardEvent): void {
      if (page !== "board") return;
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest(
              'input, textarea, select, [role="slider"], [role="dialog"], [role="alertdialog"], [data-slot="popover-content"]',
            )))
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

    window.addEventListener("keydown", handleKeydown);
    return () => {
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
      session.placeHero({ heroId: hero.id, team, point: { x, y }, iconSize }),
    );
  }

  function addHero(hero: HeroDefinition): void {
    const result = session.addHero({
      heroId: hero.id,
      team: selectedTeam,
      iconSize,
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
      x: clientX,
      y: clientY,
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
    setBoardState(session.reset(iconSize));
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
    setBoardState(session.changeMap({ map: result.map, iconSize }));
    setSelectedDrawingId(null);
    setContextMenu(null);
    setAnnouncement(`${result.map.name} selected.`);
    return true;
  }

  function changeMap(mapId: BoardMapId): void {
    cancelUpload();
    const selected = isMapId(mapId)
      ? ({ kind: "builtin", id: mapId } satisfies SelectedBoardMap)
      : customMaps.find((map) => map.id === mapId);
    if (!selected) return;
    const map = resolveBoardMap(selected);
    setBoardState(session.changeMap({ map: selected, iconSize }));
    setSelectedDrawingId(null);
    setContextMenu(null);
    setAnnouncement(`${map.name} selected.`);
  }

  function openCompOnBoard(
    comp: Comp,
    mapId: MapId,
    opener?: HTMLElement | null,
  ): void {
    cancelUpload();
    if (tokens.length) {
      replacementOpener.current =
        opener ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      setBoardReplacement({ comp, mapId });
      return;
    }
    applyBoardReplacement({ comp, mapId });
  }

  function applyBoardReplacement(request: BoardReplacement): void {
    setBoardReplacement(null);
    const map = getMap(request.mapId);
    setBoardState(session.openComp(request));
    setSelectedTokenId(null);
    setContextMenu(null);
    navigate("board");
    setAnnouncement(`${request.comp.name || "Comp"} opened on ${map.name}.`);
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

  return (
    <div
      className={`app-shell${page === "changelog" ? " changelog-active" : ""}`}
    >
      <header className="topbar">
        <div className="title-group">
          <strong>Rivals Lab</strong>
        </div>
        <nav className="page-navigation" aria-label="Pages">
          <a
            className={buttonVariants({
              variant: page === "board" ? "secondary" : "ghost",
              size: "sm",
            })}
            href="/board"
            aria-current={page === "board" ? "page" : undefined}
            onClick={(event) => handlePageLink(event, "board")}
          >
            Position Board
          </a>
          <a
            className={buttonVariants({
              variant: page === "builder" ? "secondary" : "ghost",
              size: "sm",
            })}
            href="/builder"
            aria-current={page === "builder" ? "page" : undefined}
            onClick={(event) => handlePageLink(event, "builder")}
          >
            Draft / Comp Builder
          </a>
          <a
            className={buttonVariants({
              variant: page === "changelog" ? "secondary" : "ghost",
              size: "sm",
            })}
            href="/changelog"
            aria-current={page === "changelog" ? "page" : undefined}
            onClick={(event) => handlePageLink(event, "changelog")}
          >
            Changelog
          </a>
        </nav>
        <div className="header-actions" hidden={page !== "board"}>
          <Button
            variant="outline"
            size="icon"
            type="button"
            disabled={!boardState.canUndo}
            onClick={() => restoreBoard("undo")}
            title="Undo (Ctrl/Cmd+Z)"
            aria-label="Undo"
            aria-keyshortcuts="Control+z Meta+z"
          >
            <Undo2 size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            type="button"
            disabled={!boardState.canRedo}
            onClick={() => restoreBoard("redo")}
            title="Redo (Ctrl/Cmd+Shift+Z)"
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+z Meta+Shift+z"
          >
            <Redo2 size={16} aria-hidden="true" />
          </Button>
          <Button variant="outline" type="button" onClick={clearBoard}>
            Clear
          </Button>
          <Button type="button" onClick={resetBoard}>
            Reset
          </Button>
        </div>
      </header>

      <main className="app-main" hidden={page !== "board"}>
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
          active={page === "board"}
          drawingControls={
            <DrawingTools
              active={page === "board"}
              tool={tool}
              color={drawingColor}
              selected={selectedDrawing}
              onTool={changeTool}
              onColor={setDrawingColor}
              onEdit={editDrawing}
              onAdd={() => {
                if (tool === "move") return;
                showDrawingEdit(
                  session.addDrawing({ kind: tool, color: drawingColor }),
                );
              }}
            />
          }
          selectedMapId={selectedMapId}
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
          onIconSizeChange={setIconSize}
          onMapChange={changeMap}
          onDrop={handleBoardDrop}
          onKeyDown={handleBoardKeyDown}
        />
      </main>

      <div className="builder-page" hidden={page !== "builder"}>
        <CompBuilder
          active={page === "builder"}
          onOpenBoard={openCompOnBoard}
        />
      </div>

      <div className="changelog-container" hidden={page !== "changelog"}>
        <Changelog />
      </div>

      {contextMenu && contextToken && contextHero ? (
        <TokenMenu
          x={contextMenu.x}
          y={contextMenu.y}
          token={contextToken}
          hero={contextHero}
          onRemove={removeToken}
          onClose={() => setContextMenu(null)}
          finalFocus={() => visibleFocusTarget(boardHostRef.current)}
        />
      ) : null}
      {contextMenu && contextDrawing ? (
        <DrawingMenu
          x={contextMenu.x}
          y={contextMenu.y}
          drawing={contextDrawing}
          onRemove={removeDrawing}
          onClose={() => setContextMenu(null)}
          finalFocus={() => visibleFocusTarget(boardHostRef.current)}
        />
      ) : null}
      <ConfirmAction
        open={boardReplacement !== null}
        copy={BOARD_REPLACEMENT_COPY}
        onCancel={() => setBoardReplacement(null)}
        onConfirm={() => {
          if (boardReplacement) applyBoardReplacement(boardReplacement);
        }}
        finalFocus={() => visibleFocusTarget(replacementOpener.current)}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
