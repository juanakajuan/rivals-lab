import { useEffect, useState } from "react";
import type { AppData } from "./appData";
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
  const [page, setPage] = useState<Page>(pageFromPath);
  const board = useBoardController({ active: page === "board" });
  const { dismissMenu } = board;

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
        {board.headerActions}
      </header>
      {board.content}
      <div className="builder-page" hidden={page !== "builder"}>
        <CompBuilder storage={data.comps} onOpenBoard={openCompOnBoard} />
      </div>
      <div className="changelog-container" hidden={page !== "changelog"}>
        <Changelog />
      </div>
      {board.overlays}
    </div>
  );
}
