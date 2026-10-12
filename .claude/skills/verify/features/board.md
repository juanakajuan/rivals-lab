# Position Board

The board shows hero tokens on a map canvas. Users select a token, drag it, and undo or redo the move.

## Sub-features

- `board-select` selecting a token shows its name and coordinates.
- `board-drag` dragging changes the coordinates.
- `board-undo` Undo restores the earlier position; Redo reapplies the move.
- `board-place` Add/Remove hero buttons for Allies and Opponents (see `tests/boardHeroPlacement.spec.ts`).

## How to get to it (user POV)

- Open `/board` or `/`.
- Choose the `Position Board` link in the `Pages` navigation.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Select and drag.** Run `node .claude/skills/verify/scripts/drive.mjs board-undo`. Clicking canvas point (270, 435) selects `Doctor Strange` and `.coordinates` reads `x 270, y 435`. Dragging by (80, 45) changes it to `x 350, y 480`.
- **Undo and redo.** The same flow presses `Undo` then `Redo`. The coordinates return to the start, then to the moved value.
- **Placement.** Choose `Clear`, then `Add Angela to Allies`. The `Allies` button count increases. No flow exists yet; copy one from `drive.mjs`.

## Gotchas

- Canvas coordinates are in 1200-wide board units; scale mouse positions by the canvas width.
- Board history resets on reload.
