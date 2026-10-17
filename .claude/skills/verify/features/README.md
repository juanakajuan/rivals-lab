# Rivals Lab verification map

Source of truth for verifying user-facing behavior. Read this index, then the matching feature file.

## Baseline preconditions

- Server started with `node .claude/skills/verify/scripts/server.mjs up`, and `doctor` passes.
- Each flow starts from an empty browser context. No seed data is needed.
- Never drive a server this run did not start.

## Driving conventions

- Prefer ARIA roles and accessible names over CSS selectors.
- Wait for status text with a retrying assertion instead of reading it once; it updates after the action. Several `status` regions can exist, so scope the locator (for example `.save-status` in the builder).
- Do not remove `artifacts/verify/` during cleanup.

## Proof and skip reporting

- UI proof is a screenshot before and after the action plus the asserted value.
- Report an unreachable path with the attempted step and the unmet precondition. Do not claim a feature verified through a different entry point.

## Feature entry contract

Each file has an H1, one paragraph, then exactly four H2s: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`.

## Features

- [Position Board](./board.md) covers token selection, drag, undo, redo, placement, and autosave.
- [Comp Builder save](./builder-save.md) covers naming, hero picks, notes, map, save, autosave, and load.
- [Image export](./export-png.md) covers PNG download from the builder.
- [Changelog](./changelog.md) covers the release notes page.
- [Backup](./backup.md) covers the full-data backup download.
- [Page routes](./routes.md) covers URL handling, tab titles, and the not-found page.
