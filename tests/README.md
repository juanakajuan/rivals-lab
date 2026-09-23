Run `npx playwright install chromium` once, then `npm test`.
To use an installed Chromium, run
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test`.

Tests use real browser events and the board interface. They cover drag updates,
late images, resize, map changes, cleanup, and the React caller.

History tests cover edit order, redo invalidation, unchanged edits, grouped map
changes, drag completion, restore during a drag, text-safe shortcuts, and session reset.
