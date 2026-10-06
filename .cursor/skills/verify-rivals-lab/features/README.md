# Rivals Lab verification map

This directory is the maintained source for verifying the user-facing behavior of Rivals Lab. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs launch`.
- The default instance is `http://127.0.0.1:4183` with a new Chromium profile. A second instance needs its own `RIVALS_VERIFY_PORT` and `RIVALS_VERIFY_RUN`.
- Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs doctor` and require the recorded URL, this checkout, and the private profile.
- The profile starts with no saved comps. The Position Board starts with the example formation, not an empty map.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or screen coordinates.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run every browser action through `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs`.
- `assert-visible` requires exactly one match. Use `assert-count` for zero or for repeated text.
- Pass `--accept-dialog` when the recipe says the app asks to confirm. Otherwise the confirm is dismissed and the stored data stays as it was.
- Restore mutated library entries before leaving a save recipe. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a full-page screenshot with `Rivals Lab` visible.
- A saved comp is proven by loading it again after `reload` in the same verification profile.
- A board edit is proven on the board after the action. Reload is not persistence for the board.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Place a hero](./place-hero.md) covers clearing the example formation, adding and removing a hero, switching team, and searching the hero list.
- [Undo a board edit](./undo-board.md) covers Undo, Redo, and the header shortcuts after a hero is added.
- [Choose a map](./choose-map.md) covers the map picker, search, close, and a custom image upload.
- [Save a comp](./save-comp.md) covers naming, hero choice, notes, save, reload, load, and opening the comp on the Position Board.
- [Read the changelog](./changelog.md) covers the Changelog page, published notes, and navigation back to an unsaved comp note.
