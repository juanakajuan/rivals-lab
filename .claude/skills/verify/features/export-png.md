# Image export

The builder exports the current comp as a PNG download, and tries to copy it to the clipboard.

## Sub-features

- `export-download` the PNG downloads with a file name from the comp name.
- `export-clipboard` clipboard copy works only where the browser allows it; a limit must not block the download.

## How to get to it (user POV)

- Open `/builder`, then choose `Download & Copy`.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Download.** Run `node .claude/skills/verify/scripts/drive.mjs export-png`. After naming the comp `Verify export`, the download is `Verify-export.png`, non-trivial in size, and saved under `artifacts/verify/export-png/`. The status starts with `Download started.`.

## Gotchas

- Clipboard checks need permissions and a secure context; this flow checks the download only.
- Open the saved PNG to check the image, not only the file size.
