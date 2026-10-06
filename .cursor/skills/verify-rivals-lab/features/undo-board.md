# Undo a board edit

Undo a board edit lets a user reverse and restore the last Position Board change with the header buttons or the keyboard shortcuts.

## Sub-features

- `undo-button` reverses an added hero with the `Undo` button.
- `redo-button` restores that hero with the `Redo` button.
- `undo-keys` reverses and restores the same edit from the keyboard when focus is outside a text field.

## How to get to it (user POV)

- On the Position Board, choose `Undo` or `Redo` in the header.
- Press Ctrl+Z or Cmd+Z to undo.
- Press Ctrl+Shift+Z, Cmd+Shift+Z, or Ctrl+Y to redo.

## Driving it with verify.mjs

Preconditions:

- Doctor reports the verification URL and a private browser profile.
- The page is the Position Board.
- The board has been cleared, Angela is not on Allies, and `Undo` is enabled because `Clear` itself is an edit.

- **Clear.** Choose `Clear`. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs goto /board` and `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Clear"`. `Allies 0` is present and `Undo` is visible.
- **Add a hero.** Choose `Add Angela to Allies`. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Add Angela to Allies"`. `Allies 1` and `Remove Angela from Allies` are present.
- **Undo the add.** Choose `Undo`. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Undo"`. `Allies 0` and `Add Angela to Allies` are present. `Redo` is visible.
- **Redo the add.** Choose `Redo`. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs click --role button --name "Redo"`. `Allies 1` and `Remove Angela from Allies` are present.
- **Keyboard undo.** Move focus out of the search field and press Ctrl+Z. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs press --key "Control+z"`. `Allies 0` is present.
- **Keyboard redo.** Press Ctrl+Shift+Z. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs press --key "Control+Shift+z"`. `Allies 1` is present.
- **Proof.** Capture the restored hero. Run `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs snapshot --path artifacts/verify/undo-board/redone.aria.yml` and `node .cursor/skills/verify-rivals-lab/scripts/verify.mjs screenshot --path artifacts/verify/undo-board/redone.png`. Both artifacts show `Rivals Lab`, `Allies 1`, and `Angela`.

## Gotchas

- `Clear` is an edit. The first `Undo` after a clear-then-add returns to the cleared board, not to the example formation. One more `Undo` restores the example formation.
- A new edit after `Undo` discards the redo. Add a different hero before pressing `Redo` and the undone Angela placement is gone.
- Ctrl+Z and Ctrl+Shift+Z edit text when a search box, note, or other field has focus. Click the map heading or press the keys only after focus has left those fields.
- The header shortcuts are Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. Ctrl+Y redo is for Windows and Linux keyboards; this Chromium profile receives `Control+y`.
- Reload drops undo history. Prove undo on the same page that made the edit.
- `Undo` and `Redo` are hidden on Draft / Comp Builder and Changelog. Drive them from the Position Board.
