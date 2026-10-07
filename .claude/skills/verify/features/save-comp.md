# Save a comp

Save a comp lets a user name a plan, choose heroes and notes, save it in this browser, find it again after reload, and open it on the Position Board.

## Sub-features

- `save-reject-empty` asks for a name before writing.
- `save-create` stores a named Allies hero and comp notes.
- `save-reload` loads that comp from the library after a reload.
- `save-open-board` places the comp's heroes on a chosen Position Board map.

## How to get to it (user POV)

- Open `/builder`.
- Choose `Draft / Comp Builder` in the `Pages` navigation.
- After a save, choose `Load <name>` in `Saved comps`.
- Choose `Open on Position Board` to send the current comp to the board.

## Driving it with verify.mjs

Preconditions:

- Doctor reports the verification URL and a private browser profile.
- This profile has no comp named `Verify dive`.
- The builder status starts as `New comp · not saved`.

- **Open the builder.** Go to the builder. Run `node .claude/skills/verify/scripts/verify.mjs goto /builder`. The heading `Draft / Comp Builder` is present, `Draft / Comp Builder` has `aria-current` `page`, and the status `New comp · not saved` is present.
- **Reject an empty save.** Choose `Save` before entering a name. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Save"`. The alert `Enter a comp name before saving.` is present. `Load Verify dive` has count `0`.
- **Name the comp.** Fill `Comp name` and `Comp notes`. Run `node .claude/skills/verify/scripts/verify.mjs fill --label "Comp name" --value "Verify dive"` and `node .claude/skills/verify/scripts/verify.mjs fill --label "Comp notes" --value "Hold high ground"`. The status `Unsaved changes` is present.
- **Choose a hero.** Open Allies slot 1 and choose Angela. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Allies slot 1: Choose hero"`. The dialog `Choose hero · Allies · Slot 1` is present. Run `node .claude/skills/verify/scripts/verify.mjs assert-visible --role dialog --name "Choose hero · Allies · Slot 1"` and `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Angela"`. The dialog closes and `Allies slot 1: Angela` is present.
- **Save.** Choose `Save`. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Save"`. The status `Saved Verify dive.` is present and `Load Verify dive` is present.
- **Reload.** Reload the builder. Run `node .claude/skills/verify/scripts/verify.mjs reload`. The field `Comp name` is empty, the status `New comp · not saved` is present, and `Load Verify dive` is still present.
- **Load.** Choose `Load Verify dive`. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Load Verify dive"`. The status `Loaded Verify dive.` is present. Run `node .claude/skills/verify/scripts/verify.mjs assert-value --label "Comp name" --value "Verify dive"`, `node .claude/skills/verify/scripts/verify.mjs assert-value --label "Comp notes" --value "Hold high ground"`, and `node .claude/skills/verify/scripts/verify.mjs assert-visible --role button --name "Allies slot 1: Angela"`. The name, notes, and Angela slot all match the save.
- **Open on the board.** Choose `Open on Position Board`, then choose Museum of Contemplation and accept the replace confirm on that click. Run `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Open on Position Board"` and `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Museum of Contemplation" --accept-dialog`. The dialog text is `Replace the current Position Board placements with this comp?`. The URL ends in `/board`, the heading is `Museum of Contemplation`, and `Remove Angela from Allies` is present.
- **Proof.** Capture the board after the transfer. Run `node .claude/skills/verify/scripts/verify.mjs snapshot --path artifacts/verify/save-comp/on-board.aria.yml` and `node .claude/skills/verify/scripts/verify.mjs screenshot --path artifacts/verify/save-comp/on-board.png`. Both artifacts show `Rivals Lab`, `Museum of Contemplation`, and `Angela`.
- **Delete the fixture.** Return to the builder and delete the comp. Run `node .claude/skills/verify/scripts/verify.mjs goto /builder` and `node .claude/skills/verify/scripts/verify.mjs click --role button --name "Delete Verify dive" --accept-dialog`. The dialog text is `Delete “Verify dive” from this browser?`. `Load Verify dive` has count `0`.

## Gotchas

- `Save` with a blank name shows `Enter a comp name before saving.` and does not create a library entry. The saved name is the trimmed field value.
- Reload keeps the library and opens a new unsaved comp. `Saved Verify dive.` does not survive the reload. Prove the save by choosing `Load Verify dive` and reading the name, notes, and slot.
- This profile's library starts empty. Comps saved in the user's everyday browser are not visible here.
- `New comp`, `Delete`, and a load that would discard unsaved edits ask for a confirm. Without `--accept-dialog` the confirm is dismissed and the library stays unchanged. The delete confirm is `Delete “Verify dive” from this browser?` with curly quotes.
- A new comp's map is `Any map`, so `Open on Position Board` opens the dialog `Choose a Position Board map` instead of navigating immediately. The button stays disabled until at least one team slot has a hero.
- The Position Board starts with the example formation, so opening a comp asks `Replace the current Position Board placements with this comp?`. Accept that confirm. After a `Clear` on the board, the confirm is not shown.
- `Save As` opens a dialog named `Save comp as`. `Draft format` is a combobox labeled `Draft format`; `mrc` and `ignite` add ban and save slots, and `free` is the default free build.
