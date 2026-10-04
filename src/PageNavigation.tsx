export type Page = "board" | "builder" | "changelog";

export function PageNavigation({
  page,
  onNavigate,
}: {
  readonly page: Page;
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
        Position Board
      </a>
      <a
        href="/builder"
        aria-current={page === "builder" ? "page" : undefined}
        onClick={(event) => handlePageLink(event, "builder")}
      >
        Draft / Comp Builder
      </a>
      <a
        href="/changelog"
        aria-current={page === "changelog" ? "page" : undefined}
        onClick={(event) => handlePageLink(event, "changelog")}
      >
        Changelog
      </a>
    </nav>
  );
}
