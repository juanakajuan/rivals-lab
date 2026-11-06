# Position Board

The board shows hero tokens on a map canvas. Users add heroes to a team, select a token, drag it, zoom and pan the map, and undo or redo each change. The board autosaves to the browser and comes back after a reload.

## Sub-features

- `board-select` selecting a token shows its name and coordinates.
- `board-drag` dragging changes the coordinates.
- `board-undo` Undo restores the earlier position; Redo reapplies the move.
- `board-place` `Add <hero> to <Team>` and `Remove <hero> from <Team>` buttons for Allies and Opponents, at most 6 heroes per team. When a team is full, its Add buttons are disabled (see `tests/boardHeroPlacement.spec.ts`).
- `board-persist` tokens, map, drawings, and icon size survive a reload; undo history does not (see `tests/boardUndoRedo.spec.ts`).
- `board-zoom` the `Map zoom` group: `Zoom in`, `Zoom out`, `Fit map`, and the `.zoom-level` text, from 100% to 800%. The mouse wheel zooms at the pointer, and `+`, `=`, `-`, and `0` work while `.stage-host` has focus. In `Move` mode, dragging empty map space pans a zoomed map. Zoom is not saved, and a map change resets it (see `tests/boardZoom.spec.ts`).
- `board-draw` the `Board mode` group: `Move`, `Draw arrow`, `Draw zone`, `Add note`, `Drawing color`, and `Add at center` (see `src/DrawingTools.tsx`, `tests/boardDrawings.spec.ts`). No flow.
- `board-map` `Choose map` opens the `Choose map` dialog, with `Search maps` and `Upload image` (input `Upload map image`). A map with more than one stage shows the `Stage` group, one `aria-pressed` button per stage (see `tests/boardCustomMaps.spec.ts`, `tests/multiMap.spec.ts`). No flow.
- `board-icon-size` the `Hero icon size` slider, 50% to 150% (see `tests/heroIconSize.spec.ts`). No flow.

## How to get to it (user POV)

- Open `/board` or `/`.
- Choose the `Position Board` link in the `Pages` navigation.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Select, drag, undo, redo.** Run `node .claude/skills/verify/scripts/drive.mjs board-undo`. `Add Doctor Strange to Allies` places and selects `Doctor Strange`; the flow reads its start from `.coordinates`. Dragging by (80, 45) changes `.coordinates`. `Undo` returns it to the start, and `Redo` returns it to the moved value.
- **Placement and persistence.** Run `node .claude/skills/verify/scripts/drive.mjs board-place`. A new board reads `Allies 0` and `Opponents 0`. `Add Angela to Allies` makes it `Allies 1` and selects `Angela`. Undo and Redo apply to the placement. `Clear` makes it `Allies 0`, and `Undo` restores it. After a reload, `Allies 1` stays, and `Undo` and `Redo` are disabled.
- **Zoom and pan.** Run `node .claude/skills/verify/scripts/drive.mjs board-zoom`. `Zoom in` gives `150%`, `+` gives `225%`, and `-` gives `150%`. The wheel zooms in more. A drag on the map in `Move` mode changes the map image. `Fit map` gives `100%` and is then disabled, and a click at the hero's first position still selects it. After a reload, the zoom is `100%`.

## Gotchas

- Canvas coordinates are in map units. Each map's longest side is 1200 units, but its shortest side is at least 300, so a very wide custom image can be wider than 1200. Most built-in stages are portrait: the default stage is about 442 by 1200. Read the size from `.stage-host` `data-map-width` and `data-map-height`, and scale by the canvas width.
- When zoomed, the canvas fills the host and has a pan offset, so the 100% scale is wrong. Choose `Fit map` first.
- In `Move` mode, `Add at center` is hidden, not disabled.
- The `Game mode` group is in the builder's `Comp map` dialog only. The board's `Choose map` dialog has no `Game mode` group.
- The board autosaves to IndexedDB. A fresh browser context starts with an empty board; a reload keeps placed and moved tokens.
- Undo history is in memory only and resets on reload.
- Match the team button with `getByRole("button", { name: /^Allies/ })`; its name includes the count.
