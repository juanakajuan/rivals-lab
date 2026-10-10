export type Page = "board" | "builder" | "changelog";

export const PAGE_LABELS: Readonly<Record<Page, string>> = {
  board: "Position Board",
  builder: "Draft / Comp Builder",
  changelog: "Changelog",
};

export function PageNavigation({
  page,
  onNavigate,
}: {
  readonly page: Page | null;
  readonly onNavigate: (page: Page) => void;
}): React.JSX.Element {
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
    onNavigate(nextPage);
  }

  return (
    <nav className="page-navigation" aria-label="Pages">
      <a
        href="/board"
        aria-current={page === "board" ? "page" : undefined}
        onClick={(event) => handlePageLink(event, "board")}
      >
        {PAGE_LABELS.board}
      </a>
      <a
        href="/builder"
        aria-current={page === "builder" ? "page" : undefined}
        onClick={(event) => handlePageLink(event, "builder")}
      >
        {PAGE_LABELS.builder}
      </a>
      <a
        href="/changelog"
        aria-current={page === "changelog" ? "page" : undefined}
        onClick={(event) => handlePageLink(event, "changelog")}
      >
        {PAGE_LABELS.changelog}
      </a>
    </nav>
  );
}
