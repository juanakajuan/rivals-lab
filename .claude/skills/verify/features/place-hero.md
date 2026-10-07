# Place a hero

Place a hero lets a user clear the example formation, add one hero to Allies or Opponents, remove that hero, and filter the hero list.

## Sub-features

- `place-clear` removes the example formation from the current map.
- `place-add` puts Angela on the Allies side at the first open point.
- `place-remove` takes that Allies hero off the map.
- `place-team` adds the same hero name to Opponents as a separate token.
- `place-search` filters the hero list and restores it.

## How to get to it (user POV)

- Open `/`, `/board`, or any path other than `/builder` and `/changelog`.
- Choose `Position Board` in the `Pages` navigation.

## Driving it with verify.mjs

Preconditions:

- Doctor reports the verification URL and a private browser profile.
- The page is the Position Board. `Position Board` has `aria-current` `page`.
- The board still has the example formation, or the recipe clears it first.

- **Open the board.** Go to the Position Board. Run `node .claude/skills/verify/scripts/verify.mjs goto /board`. The link `Position Board` is current and the heading is `Intergalactic Empire of Wakanda: Birnin T'Challa`.
- **Confirm the example.** Check the starting teams. Run `node .claude/skills/verify/scripts/verify.mjs assert-visible --role button --name "Allies 3"` and `node .claude/skills/verify/scripts/verify.mjs assert-visible --role button --name "Opponents 3"`. Both buttons are present. `Remove Doctor Strange from Allies` is present.
- **Clear the board.** Choose `Clear`. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Clear"`. `Allies 0` and `Opponents 0` are present, and `Add Doctor Strange to Allies` is present.
- **Capture the clear.** Save the empty board. Run `node .claude/skills/verify/scripts/verify.mjs snapshot --path artifacts/verify/place-hero/cleared.aria.yml` and `node .claude/skills/verify/scripts/verify.mjs screenshot --path artifacts/verify/place-hero/cleared.png`. Both artifacts show `Rivals Lab`, `Allies 0`, and `Opponents 0`.
- **Add Angela.** Choose `Add Angela to Allies`. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Add Angela to Allies"`. The button `Remove Angela from Allies` is present, `Allies 1` is present, and the text `x 52, y 52` is present.
- **Capture the add.** Save the placed hero. Run `node .claude/skills/verify/scripts/verify.mjs snapshot --path artifacts/verify/place-hero/added.aria.yml` and `node .claude/skills/verify/scripts/verify.mjs screenshot --path artifacts/verify/place-hero/added.png`. Both artifacts show `Rivals Lab`, `Angela`, and `Allies 1`.
- **Remove Angela.** Choose `Remove Angela from Allies`. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Remove Angela from Allies"`. `Add Angela to Allies` and `Allies 0` are present.
- **Switch team.** Choose `Opponents`, then add Angela there. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Opponents 0"` and `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Add Angela to Opponents"`. `Opponents 1` and `Remove Angela from Opponents` are present. `Allies 0` stays present.
- **Search.** Type `angela` in `Search heroes`. Run `node .claude/skills/verify/scripts/verify.mjs fill --role searchbox --name "Search heroes" --value "angela"`. `Add Hulk to Opponents` has count `0`, and `Remove Angela from Opponents` is present.
- **Empty search.** Replace the query with `zzzz`. Run `node .claude/skills/verify/scripts/verify.mjs fill --role searchbox --name "Search heroes" --value "zzzz"`. The text `No heroes match “zzzz”.` is present.
- **Clear search.** Choose `Clear hero search`. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Clear hero search"`. `Add Hulk to Opponents` is present again.

## Gotchas

- The board opens on the example formation: Doctor Strange, Psylocke, and Luna Snow on Allies, and Magneto, Magik, and Rocket Raccoon on Opponents. Clear before expecting an empty map.
- `Reset` restores that example formation. It is a different control from `Clear`.
- The team buttons include the count in the accessible name: `Allies 0`, `Allies 1`, `Opponents 0`. Match the full name.
- A hero can be placed once per team. After Angela is on Allies, that row's button is `Remove Angela from Allies`.
- Adding the first hero on a cleared board lands at `x 52, y 52`. A later hero uses the next open point. Assert the coordinates the recipe names, not a generic "on the map".
- Board placements disappear on reload. Prove them on the current page. Undo is the way to reverse a placement without reloading.
- `Search heroes` only filters the list. Typing there does not add a hero.
- The empty-search sentence uses curly quotes: `No heroes match “zzzz”.`
