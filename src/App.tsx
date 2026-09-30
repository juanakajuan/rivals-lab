import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";

import { BoardPanel, DrawingMenu, HeroPanel, TokenMenu } from "./AppPanels";
import { DrawingTools } from "./DrawingTools";
import {
  createDrawing,
  moveDrawing,
  type BoardDrawing,
  type BoardTool,
} from "./boardDrawings";
import { CompBuilder } from "./CompBuilder";
import type { Comp } from "./comps";
import {
  clampToBoard,
  createBoardCanvas,
  type BoardCanvas,
  type BoardToken,
} from "./boardCanvas";
import {
  HERO_BY_ID,
  HEROES,
  isTeam,
  teamLabel,
  type HeroDefinition,
  type Team,
} from "./heroes";
import { boardHistoryReducer, createBoardHistory } from "./boardHistory";
import { DEFAULT_MAP_ID, getMap, isMapId, type MapId } from "./maps";

type Page = "board" | "builder";

function pageFromPath(): Page {
  return window.location.pathname === "/builder" ? "builder" : "board";
}

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

function initialTokens(): BoardToken[] {
  return [
    { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 435 },
    { id: "ally-psylocke", heroId: "psylocke", team: "ally", x: 380, y: 350 },
    { id: "ally-luna", heroId: "luna", team: "ally", x: 230, y: 520 },
    { id: "enemy-magneto", heroId: "magneto", team: "enemy", x: 865, y: 310 },
    { id: "enemy-magik", heroId: "magik", team: "enemy", x: 960, y: 410 },
    { id: "enemy-rocket", heroId: "rocket", team: "enemy", x: 910, y: 515 },
  ];
}

function updateTokenPosition(
  tokens: readonly BoardToken[],
  tokenId: string,
  x: number,
  y: number,
): BoardToken[] {
  return tokens.map((token) => {
    if (token.id !== tokenId) return token;
    return { ...token, x, y };
  });
}

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>(pageFromPath);
  const boardHostRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<BoardCanvas | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team>("ally");
  const [history, dispatch] = useReducer(boardHistoryReducer, undefined, () =>
    createBoardHistory({ mapId: DEFAULT_MAP_ID, tokens: initialTokens() }),
  );
  const [tool, setTool] = useState<BoardTool>("move");
  const [drawingColor, setDrawingColor] = useState("#ffd166");
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(
    null,
  );
  const [iconSize, setIconSize] = useState(100);
  const { mapId: selectedMapId, tokens: savedTokens } = history.present;
  const mapDrawings =
    history.present.drawingsByMap?.[selectedMapId] ?? EMPTY_DRAWINGS;
  const selectedDrawing = mapDrawings.find(
    (drawing) => drawing.id === selectedDrawingId,
  );
  const selectedMap = getMap(selectedMapId);
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

  useEffect(() => {
    function handlePopState(): void {
      setPage(pageFromPath());
      setContextMenu(null);
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
        dispatch({
          type: "edit",
          update: (board) => ({
            ...board,
            tokens: updateTokenPosition(board.tokens, token.id, x, y),
          }),
        });
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
          x: Math.max(8, Math.min(clientX, window.innerWidth - 168)),
          y: Math.max(8, Math.min(clientY, window.innerHeight - 52)),
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
  }, []);

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
      if (page !== "board") return;
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

  function placeHero(
    hero: HeroDefinition,
    x: number,
    y: number,
    team: Team,
  ): void {
    const id = `${team}-${hero.id}`;
    const boardX = clampToBoard(x, selectedMap.width, iconSize);
    const boardY = clampToBoard(y, selectedMap.height, iconSize);
    const existingToken = tokens.find((token) => token.id === id);
    setTool("move");
    setSelectedDrawingId(null);
    setSelectedTokenId(id);

    if (existingToken) {
      dispatch({
        type: "edit",
        update: (board) => ({
          ...board,
          tokens: updateTokenPosition(board.tokens, id, boardX, boardY),
        }),
      });
      setAnnouncement(`${hero.name} moved to ${boardX}, ${boardY}.`);
      return;
    }

    const token: BoardToken = {
      id,
      heroId: hero.id,
      team,
      x: boardX,
      y: boardY,
    };
    dispatch({
      type: "edit",
      update: (board) => ({ ...board, tokens: [...board.tokens, token] }),
    });
    setAnnouncement(`${hero.name} added to ${teamLabel(team)}.`);
  }

  function addHero(hero: HeroDefinition): void {
    if (tokens.some((token) => token.id === `${selectedTeam}-${hero.id}`))
      return;

    const spacing = (64 * iconSize) / 100;
    const startX = selectedTeam === "ally" ? 0 : selectedMap.width / 2;
    const endX = startX + selectedMap.width / 2;
    for (let y = spacing; y < selectedMap.height; y += spacing) {
      for (let x = startX + spacing; x < endX; x += spacing) {
        if (
          tokens.every(
            (token) =>
              Math.abs(token.x - x) >= spacing ||
              Math.abs(token.y - y) >= spacing,
          )
        ) {
          placeHero(hero, x, y, selectedTeam);
          return;
        }
      }
    }
    placeHero(
      hero,
      startX + selectedMap.width / 4,
      selectedMap.height / 2,
      selectedTeam,
    );
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
    dispatch({
      type: "edit",
      update: (board) => ({
        ...board,
        tokens: board.tokens.filter((current) => current.id !== token.id),
      }),
    });
    setSelectedTokenId((currentId) =>
      currentId === token.id ? null : currentId,
    );
    setContextMenu(null);
    setAnnouncement(`${heroName} removed from the board.`);
  }

  function editDrawing(drawing: BoardDrawing): void {
    dispatch({
      type: "edit",
      update: (board) => {
        const drawings = board.drawingsByMap?.[board.mapId] ?? [];
        return {
          ...board,
          drawingsByMap: {
            ...board.drawingsByMap,
            [board.mapId]: drawings.some((item) => item.id === drawing.id)
              ? drawings.map((item) =>
                  item.id === drawing.id ? drawing : item,
                )
              : [...drawings, drawing],
          },
        };
      },
    });
    setSelectedDrawingId(drawing.id);
    setSelectedTokenId(null);
    setAnnouncement(`${drawing.kind} updated.`);
  }

  function moveSelectedDrawing(dx: number, dy: number): void {
    if (selectedDrawing)
      editDrawing(
        moveDrawing(
          selectedDrawing,
          selectedDrawing.x + dx,
          selectedDrawing.y + dy,
          selectedMap,
        ),
      );
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
      x: Math.max(8, Math.min(clientX, window.innerWidth - 168)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - 52)),
    });
    setAnnouncement(`${drawing.kind} menu opened.`);
  }

  function removeDrawing(drawing: BoardDrawing): void {
    dispatch({
      type: "edit",
      update: (board) => ({
        ...board,
        drawingsByMap: {
          ...board.drawingsByMap,
          [board.mapId]: (board.drawingsByMap?.[board.mapId] ?? []).filter(
            (item) => item.id !== drawing.id,
          ),
        },
      }),
    });
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
    dispatch({
      type: "edit",
      update: (board) => ({
        ...board,
        tokens: initialTokens(),
        drawingsByMap: { ...board.drawingsByMap, [board.mapId]: [] },
      }),
    });
    setSelectedTokenId(null);
    setAnnouncement("The example formation is restored.");
  }

  function clearBoard(): void {
    dispatch({
      type: "edit",
      update: (board) => ({
        ...board,
        tokens: [],
        drawingsByMap: { ...board.drawingsByMap, [board.mapId]: [] },
      }),
    });
    setSelectedTokenId(null);
    setAnnouncement("The board is clear.");
  }

  function changeMap(value: string): void {
    if (!isMapId(value)) return;
    const map = getMap(value);
    dispatch({
      type: "edit",
      update: (board) => ({
        ...board,
        mapId: value,
        tokens: board.tokens.map((token) => ({
          ...token,
          x: clampToBoard(token.x, map.width, iconSize),
          y: clampToBoard(token.y, map.height, iconSize),
        })),
      }),
    });
    setSelectedDrawingId(null);
    setContextMenu(null);
    setAnnouncement(`${map.name} selected.`);
  }

  function openCompOnBoard(comp: Comp, mapId: MapId): void {
    if (
      tokens.length &&
      !window.confirm(
        "Replace the current Position Board placements with this comp?",
      )
    )
      return;
    const map = getMap(mapId);
    const nextTokens: BoardToken[] = [];
    const teams: readonly Team[] = ["ally", "enemy"];
    for (const team of teams) {
      comp.teams[team].forEach((slot, index) => {
        if (!slot.heroId) return;
        nextTokens.push({
          id: `${team}-${slot.heroId}`,
          heroId: slot.heroId,
          team,
          ...(slot.deadpoolRole ? { deadpoolRole: slot.deadpoolRole } : {}),
          x: Math.round(
            map.width * (team === "ally" ? 0.25 : 0.75) + (index % 2) * 65 - 32,
          ),
          y: Math.round(map.height * 0.3 + Math.floor(index / 2) * 80),
        });
      });
    }
    dispatch({
      type: "edit",
      update: (board) => ({ ...board, mapId, tokens: nextTokens }),
    });
    setSelectedTokenId(null);
    setContextMenu(null);
    navigate("board");
    setAnnouncement(`${comp.name || "Comp"} opened on ${map.name}.`);
  }

  function restoreBoard(type: "undo" | "redo"): void {
    if (
      type === "undo" ? history.past.length === 0 : history.future.length === 0
    )
      return;
    dispatch({ type });
    setContextMenu(null);
    setAnnouncement(
      type === "undo" ? "Board edit undone." : "Board edit restored.",
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-group">
          <strong>Rivals Lab</strong>
        </div>
        <nav className="page-navigation" aria-label="Pages">
          <a
            href="/board"
            aria-current={page === "board" ? "page" : undefined}
            onClick={(event) => handlePageLink(event, "board")}
          >
            Position Board
          </a>
          <a
            href="/builder"
            aria-current={page === "builder" ? "page" : undefined}
            onClick={(event) => handlePageLink(event, "builder")}
          >
            Draft / Comp Builder
          </a>
        </nav>
        <div className="header-actions" hidden={page !== "board"}>
          <button
            className="secondary-button history-button"
            type="button"
            disabled={history.past.length === 0}
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
            disabled={history.future.length === 0}
            onClick={() => restoreBoard("redo")}
            title="Redo (Ctrl/Cmd+Shift+Z)"
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+z Meta+Shift+z"
          >
            <Redo2 size={16} aria-hidden="true" />
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={clearBoard}
          >
            Clear
          </button>
          <button className="primary-button" type="button" onClick={resetBoard}>
            Reset
          </button>
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
        />
        <BoardPanel
          drawingControls={
            <DrawingTools
              tool={tool}
              color={drawingColor}
              selected={selectedDrawing}
              onTool={changeTool}
              onColor={setDrawingColor}
              onEdit={editDrawing}
              onAdd={() => {
                if (tool === "move") return;
                editDrawing(
                  createDrawing(
                    tool,
                    {
                      x: selectedMap.width / 2 - 80,
                      y: selectedMap.height / 2 - 40,
                    },
                    {
                      x: selectedMap.width / 2 + 80,
                      y: selectedMap.height / 2 + 40,
                    },
                    drawingColor,
                  ),
                );
              }}
            />
          }
          selectedMapId={selectedMapId}
          selectedMap={selectedMap}
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
        <CompBuilder onOpenBoard={openCompOnBoard} />
      </div>

      {contextMenu && contextToken && contextHero ? (
        <TokenMenu
          x={contextMenu.x}
          y={contextMenu.y}
          token={contextToken}
          hero={contextHero}
          onRemove={removeToken}
        />
      ) : null}
      {contextMenu && contextDrawing ? (
        <DrawingMenu
          x={contextMenu.x}
          y={contextMenu.y}
          drawing={contextDrawing}
          onRemove={removeDrawing}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
