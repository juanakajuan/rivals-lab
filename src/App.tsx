import { useEffect, useState } from "react";
import type { AppData } from "./appData";
import { BackupButton, BackupDialog, StorageNotice } from "./BackupDialog";
import { Changelog } from "./Changelog";
import { CompBuilder } from "./CompBuilder";
import type { Comp } from "./comps";
import type { MapId } from "./maps";
import { PAGE_LABELS, PageNavigation, type Page } from "./PageNavigation";
import { useBoardController } from "./useBoardController";

type Route = Page | "not-found";

const NOT_FOUND_TITLE = "Page not found";

function routeFromPath(): Route {
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, "");
  switch (path) {
    case "":
    case "/board":
      return "board";
    case "/builder":
      return "builder";
    case "/changelog":
      return "changelog";
    default:
      return "not-found";
  }
}

function canonicalizePath(route: Route): void {
  if (route === "not-found" || window.location.pathname === "/") return;
  const path = `/${route}`;
  if (window.location.pathname !== path) {
    window.history.replaceState(null, "", path);
  }
}

function NotFound({
  onNavigate,
}: {
  readonly onNavigate: (page: Page) => void;
}): React.JSX.Element {
  return (
    <main className="not-found-page">
      <h1>{NOT_FOUND_TITLE}</h1>
      <p>
        <a
          href="/board"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("board");
          }}
        >
          Back to the Position Board
        </a>
      </p>
    </main>
  );
}

export default function App({
  data,
}: {
  readonly data: AppData;
}): React.JSX.Element {
  const { workspace, autosave, comps, compStart } = data;
  const [route, setRoute] = useState<Route>(() => {
    const initial = routeFromPath();
    canonicalizePath(initial);
    return initial;
  });
  const page = route === "not-found" ? null : route;
  const [backupOpen, setBackupOpen] = useState(false);
  const [openComp, setOpenComp] = useState(workspace.openComp);
  const board = useBoardController({
    active: route === "board",
    workspace,
  });
  useEffect(() => {
    autosave.sync({
      board: board.document.board,
      iconSize: board.document.iconSize,
      customMaps: board.document.customMaps,
      openComp,
    });
  }, [autosave, board.document, openComp]);
  const { dismissMenu } = board;

  useEffect(() => {
    const label = page === null ? NOT_FOUND_TITLE : PAGE_LABELS[page];
    document.title = `${label} | Rivals Lab`;
  }, [page]);

  useEffect(() => {
    let saving = false;
    const unsubscribe = autosave.subscribe((status) => {
      saving = status.kind === "saving";
    });
    function flush(): void {
      void autosave.flush();
    }
    function warnWhileSaving(event: BeforeUnloadEvent): void {
      if (!saving) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warnWhileSaving);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", warnWhileSaving);
    };
  }, [autosave]);

  useEffect(() => {
    function handlePopState(): void {
      const next = routeFromPath();
      canonicalizePath(next);
      setRoute(next);
      dismissMenu();
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [dismissMenu]);

  function navigate(nextPage: Page): void {
    const path = `/${nextPage}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setRoute(nextPage);
    dismissMenu();
  }

  function openCompOnBoard(comp: Comp, mapIds: readonly MapId[]): void {
    if (board.openComp(comp, mapIds)) navigate("board");
  }

  return (
    <div
      className={`app-shell${route === "changelog" ? " changelog-active" : ""}`}
    >
      <header className="topbar">
        <div className="title-group">
          <strong>Rivals Lab</strong>
        </div>
        <PageNavigation page={page} onNavigate={navigate} />
        <div className="topbar-actions">
          {board.headerActions}
          <BackupButton onClick={() => setBackupOpen(true)} />
        </div>
      </header>
      {board.content}
      {route === "not-found" ? <NotFound onNavigate={navigate} /> : null}
      <div className="builder-page" hidden={route !== "builder"}>
        <CompBuilder
          storage={comps}
          start={compStart}
          onOpenComp={setOpenComp}
          onImport={() => setBackupOpen(true)}
          onOpenBoard={openCompOnBoard}
        />
      </div>
      <div className="changelog-container" hidden={route !== "changelog"}>
        <Changelog />
      </div>
      {board.overlays}
      {backupOpen ? (
        <BackupDialog onClose={() => setBackupOpen(false)} />
      ) : null}
      <StorageNotice autosave={autosave} />
    </div>
  );
}
