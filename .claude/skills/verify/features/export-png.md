# Image export

The builder exports the current comp as a PNG download, and tries to copy it to the clipboard.

## Sub-features

- `export-download` the PNG downloads with a file name from the comp name.
- `export-clipboard` clipboard copy works only where the browser allows it; a limit must not block the download.
- `export-empty` an empty comp is refused with an alert and no download.

## How to get to it (user POV)

- Open `/builder`, then choose `Download & Copy`. While it works, the button reads `Preparing image…` and is disabled.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Download.** Run `node .claude/skills/verify/scripts/drive.mjs export-png`. After naming the comp `Verify export`, the download is `Verify-export.png`, starts with the PNG signature, is non-trivial in size, and is saved under `artifacts/verify/export-png/`. The flow waits until `.save-status` no longer reads `Copying image…`. Headless Chromium without clipboard permission ends at `Download started.`.

## Gotchas

- The file name keeps only letters, digits, spaces, `_`, and `-`, changes spaces to `-`, and stops at 80 characters. An empty result or a Windows reserved name gives `rivals-comp.png`.
- Final status strings: `Download started. Image copied to clipboard.` when the copy works, `Download started.` when it does not. A failed copy also shows an alert that starts with `Image was not copied.`.
- An empty comp gives the alert `Could not create image. Add a title, map, hero, draft choice, or note before exporting.`.
- Clipboard checks need permissions and a secure context; this flow checks the download only.
- Open the saved PNG to check the image, not only the file size.
