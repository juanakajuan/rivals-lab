import { useEffect, useState } from "react";
import type { AppData } from "./appData";
import { BackupButton, BackupDialog, StorageNotice } from "./BackupDialog";
import { Changelog } from "./Changelog";
import { CompBuilder } from "./CompBuilder";
import type { Comp } from "./comps";
import type { MapId } from "./maps";
import { PageNavigation, type Page } from "./PageNavigation";
import { useBoardController } from "./useBoardController";

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

export default function App({
  data,
}: {
  readonly data: AppData;
}): React.JSX.Element {
  const { workspace, autosave, comps, compStart } = data;
  const [page, setPage] = useState<Page>(pageFromPath);
  const [backupOpen, setBackupOpen] = useState(false);
  const [openComp, setOpenComp] = useState(workspace.openComp);
  const board = useBoardController({
    active: page === "board",
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
      setPage(pageFromPath());
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
    setPage(nextPage);
    dismissMenu();
  }

  function openCompOnBoard(comp: Comp, mapId: MapId): void {
    if (board.openComp(comp, mapId)) navigate("board");
  }

  return (
    <div
      className={`app-shell${page === "changelog" ? " changelog-active" : ""}`}
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
      <div className="builder-page" hidden={page !== "builder"}>
        <CompBuilder
          storage={comps}
          start={compStart}
          onOpenComp={setOpenComp}
          onImport={() => setBackupOpen(true)}
          onOpenBoard={openCompOnBoard}
        />
      </div>
      <div className="changelog-container" hidden={page !== "changelog"}>
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
