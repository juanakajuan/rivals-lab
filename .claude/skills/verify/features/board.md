# Position Board

The board shows hero tokens on a map canvas. Users add heroes to a team, select a token, drag it, and undo or redo each change. The board autosaves to the browser and comes back after a reload.

## Sub-features

- `board-select` selecting a token shows its name and coordinates.
- `board-drag` dragging changes the coordinates.
- `board-undo` Undo restores the earlier position; Redo reapplies the move.
- `board-place` Add/Remove hero buttons for Allies and Opponents, at most 6 heroes per team (see `tests/boardHeroPlacement.spec.ts`).
- `board-persist` tokens, map, drawings, and icon size survive a reload; undo history does not (see `tests/boardUndoRedo.spec.ts`).
- `board-draw` the `Board mode` group: `Move`, `Draw arrow`, `Draw zone`, `Add note`, `Drawing color` (see `src/DrawingTools.tsx`, `tests/boardDrawings.spec.ts`). No flow.
- `board-map` `Choose map` opens the map dialog, including custom image upload (see `tests/boardCustomMaps.spec.ts`, `tests/multiMap.spec.ts`). No flow.
- `board-icon-size` the `Hero icon size` slider, 50% to 150% (see `tests/heroIconSize.spec.ts`). No flow.

## How to get to it (user POV)

- Open `/board` or `/`.
- Choose the `Position Board` link in the `Pages` navigation.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Select, drag, undo, redo.** Run `node .claude/skills/verify/scripts/drive.mjs board-undo`. `Add Doctor Strange to Allies` places and selects `Doctor Strange`; the flow reads its start from `.coordinates`. Dragging by (80, 45) changes `.coordinates`. `Undo` returns it to the start, and `Redo` returns it to the moved value.
- **Placement and persistence.** Run `node .claude/skills/verify/scripts/drive.mjs board-place`. A new board reads `Allies 0` and `Opponents 0` and has no `Reset` button. `Add Angela to Allies` makes it `Allies 1` and selects `Angela`. Undo and Redo apply to the placement. `Clear` makes it `Allies 0`, and `Undo` restores it. After a reload, `Allies 1` stays, and `Undo` and `Redo` are disabled.

## Gotchas

- Canvas coordinates are in 1200-wide board units; scale mouse positions by the canvas width. A custom map uses 1200 for its longest side, so a portrait map is narrower.
- The board autosaves to IndexedDB. A fresh browser context starts with an empty board; a reload keeps placed and moved tokens.
- Undo history is in memory only and resets on reload.
- Match the team button with `getByRole("button", { name: /^Allies/ })`; its name includes the count.
