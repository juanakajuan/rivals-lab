# Changelog

The changelog page lists published release notes grouped by date.

## Sub-features

- `changelog-open` the page loads from navigation and a direct URL.

## How to get to it (user POV)

- Open `/changelog`.
- Choose the `Changelog` link in the `Pages` navigation.

## Driving it with Playwright

Preconditions: server up and doctor clean.

- **Open.** Run `node .claude/skills/verify/scripts/drive.mjs changelog`. The `Changelog` link is visible and the screenshot shows the dated notes.

## Gotchas

- Notes come from `releases/` at build time. A new note file in `releases/pending/` needs a server restart to appear.
