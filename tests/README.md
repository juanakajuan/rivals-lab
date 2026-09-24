Run `npx playwright install chromium` once, then `npm test`.
To use an installed Chromium, run
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`.

Tests use real browser events and the board interface. They cover drag updates,
late images, resize, map changes, cleanup, and the React caller.

Draft tests cover ban scope, saves, simultaneous choices, Undo, and imported data.
Builder tests cover browser saves, notes, copies, imports, conflicts, board transfer,
unsaved edits, and recovery when stored data is invalid.
History tests cover edit order, redo invalidation, unchanged edits, grouped map
changes, drag completion, restore during a drag, text-safe shortcuts, and session reset.
